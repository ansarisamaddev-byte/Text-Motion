import { Router } from 'express';
import { supabase } from '../config/supabase';
import { exec } from 'child_process';
import path from 'path';
import axios from 'axios';

const router = Router();

const PROFILE = process.env.NODE_ENV || 'development';

const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER!;
const GITHUB_REPO = process.env.GITHUB_REPO_NAME!;
const GITHUB_WORKFLOW_FILE = process.env.GITHUB_RENDER_WORKFLOW || 'render.yml';
const GITHUB_TOKEN = process.env.GITHUB_DISPATCH_TOKEN!;
const GITHUB_REF = process.env.GITHUB_RENDER_REF || 'main';

router.post('/', async (req, res) => {
  const { project, projectId } = req.body;

  if (!project) {
    return res.status(400).json({ error: 'Project configuration is required.' });
  }
  console.log(project)  
  try {
    // 1. Create the job in Supabase
    // Update this line in your export.ts
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
      console.error("--- DATABASE INSERT FAILED ---");
      console.error("Error Message:", dbError.message);
      console.error("Error Details:", dbError.details);
      console.error("Error Hint:", dbError.hint);
      return res.status(500).json({ error: 'Database insert failed', details: dbError });
    }
    
    console.log(`[Export Route] Created job ${job.id} for project ${projectId || 'N/A'}`);
    console.log(PROFILE === 'production' ? '[Export Route] Running in production mode.' : '[Export Route] Running in development mode.');
    // 2. Trigger the Worker
    if (PROFILE === 'production') {
      await triggerGithubActionRender(job.id);
    } else {
      // In dev, we still trigger the local worker
      runLocalRender(job.id);
    }

    return res.json({ jobId: job.id, status: 'pending' });
  } catch (error: any) {
    console.error(`[Export Route] Error creating job:`, error);
    return res.status(500).json({ error: error.message });
  }
});

function runLocalRender(jobId: string) {
  const scriptPath = path.join(__dirname, '../scripts/renderJob.ts');
  const cmd = `npx ts-node "${scriptPath}" ${jobId}`;
  console.log(`[Export Route] (dev) Spawning local render: ${cmd}`);

  exec(cmd, (error, stdout, stderr) => {
    if (stdout) console.log(`[Local Render stdout]: ${stdout}`);
    if (stderr) console.error(`[Local Render stderr]: ${stderr}`);
    if (error) console.error(`[Local Render Error]: ${error.message}`);
  });
}

async function triggerGithubActionRender(jobId: string) {
  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error(
      'GitHub dispatch is not configured (missing GITHUB_REPO_OWNER / GITHUB_REPO_NAME / GITHUB_DISPATCH_TOKEN).'
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