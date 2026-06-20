import { Router } from 'express';
import axios from 'axios';
import { supabase } from '../config/supabase';

const router = Router();

router.post('/', async (req, res) => {
  const { videoUrl, projectId } = req.body;
  console.log('[Transcription Request Received]:', { videoUrl, projectId });
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl parameter is required.' });
  }

  try {
    // 1. Insert tracking state row into Supabase
    const { data: job, error: dbError } = await supabase
      .from('jobs')
      .insert([
        {
          project_id: projectId || null,
          type: 'transcribe',
          status: 'queued',
          payload: { videoUrl }
        }
      ])
      .select()
      .single();

    if (dbError || !job) {
      console.error('[Supabase DB Error]:', dbError);
      return res.status(500).json({ error: 'Failed to create job tracking sequence.', details: dbError });
    }

    // 2. Dispatch Task based on Environment
    try {
      if (process.env.NODE_ENV === 'production') {
        // Call the GitHub repository_dispatch API
        const GITHUB_OWNER = process.env.REPO_OWNER || 'your-github-username';
        const GITHUB_REPO = process.env.REPO_TRANSCRIPT || 'your-repo-name';

        await axios.post(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
          {
            event_type: 'transcribe',
            client_payload: {
              jobId: job.id,
              videoUrl: videoUrl // Passing both explicitly 
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.TOKEN}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28'
            }
          }
        );
        console.log(`[GitHub Integration] Dispatched job ${job.id} to GitHub Actions.`);
      } else {
        // Local Dev Route: Call local FastAPI instance
        axios.post('http://localhost:8001/transcribe', {
          jobId: job.id,
          videoUrl: videoUrl
        }).then(() => {
          console.log(`[Python Integration] Task ${job.id} dispatched successfully.`);
        }).catch(err => {
          console.error("[Python API Communication Error]:", err.message);
        });
      }
    } catch (dispatchError: any) {
      console.error('[Dispatch Failure]: Updating Supabase status to failed.', dispatchError.message);
      // Fallback: don't leave the UI spinning forever if GitHub is down or token expired
      await supabase
        .from('jobs')
        .update({ status: 'failed', error_message: `Dispatch failed: ${dispatchError.message}` })
        .eq('id', job.id);
        
      throw dispatchError; 
    }

    // Instantly return 200 OK status to keep UI snappy
    return res.json({ task_id: job.id, status: 'queued' });

  } catch (error: any) {
    if (error.response) {
      console.log("Response Status:", error.response.status);
      console.log("Response Data:", error.response.data);
    }
    console.error('[Transcribe General Dispatch Error]:', error.message);
    return res.status(500).json({ error: 'Internal system transcription handler exception encountered.' });
  }
});

export default router;