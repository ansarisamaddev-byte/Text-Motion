import { Router } from 'express';
import { supabase } from '../config/supabase';
import { exec } from 'child_process';
import path from 'path';
import axios from 'axios';

const router = Router();

const PROFILE = process.env.NODE_ENV || 'development';

const GITHUB_OWNER = process.env.REPO_OWNER!;
const GITHUB_REPO = process.env.REPO_APP!;
const GITHUB_WORKFLOW_FILE = process.env.RENDER_WORKFLOW || 'render.yml';
const GITHUB_TOKEN = process.env.TOKEN!;
const GITHUB_REF = process.env.RENDER_REF || 'main';

router.post('/', async (req, res) => {
  const { project, projectId } = req.body;
  if (!project) {
    return res.status(400).json({ error: 'Project configuration is required.' });
  }
  try {
    console.log('[Export Route] Creating export job');
    console.log('[Export Route] videoSrc:', project?.videoSrc);
    console.log('[Export Route] captions:', project?.captions?.length || 0);
    console.log('[Export Route] overlays:', project?.overlays?.length || 0);

    const { data: job, error: dbError } = await supabase
      .from('jobs')
      .insert([{
          project_id: projectId || null,
          type: 'export',
          status: 'queued', // Use 'queued' instead of 'pending'
          payload: { project },
      }])
      .select()
      .single();

    // Replace your existing catch/dbError block with this
    if (dbError) {
      return res.status(500).json({ error: 'Database insert failed', details: dbError });
    }
    // 2. Trigger the Worker
    if (PROFILE === 'production') {
      await triggerGithubActionRender(job.id);
    } else {
      // In dev, we still trigger the local worker
      runLocalRender(job.id);
    }

    return res.json({ jobId: job.id, status: 'queued' });
  } catch (error: any) {
    console.error(`[Export Route] Error creating job:`, error);
    return res.status(500).json({ error: error.message });
  }
});

function runLocalRender(jobId: string) {
  const scriptPath = path.join(__dirname, '../scripts/renderJob.ts');
  const cmd = `npx ts-node "${scriptPath}" ${jobId}`;

  exec(cmd, (error, stdout, stderr) => {
    if (stdout) console.log(`[Local Render stdout]: ${stdout}`);
    if (stderr) console.error(`[Local Render stderr]: ${stderr}`);
    if (error) console.error(`[Local Render Error]: ${error.message}`);
  });
}

async function triggerGithubActionRender(jobId: string) {
  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error(
      'GitHub dispatch is not configured (missing REPO_OWNER / GITHUB_REPO_NAME / GITHUB_DISPATCH_TOKEN).'
    );
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`;

  console.log(`[Export Route] (prod) Dispatching GitHub Action render for job ${jobId}`);

  await axios.post(
    url,
    { ref: GITHUB_REF, inputs: { job_id: jobId } },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
}

export default router;