import { Router } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

router.get('/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (error || !job) {
      return res.status(404).json({ error: 'Target pipeline state element not located.' });
    }

    let parsedResult: any = null;
    if (job.result_url) {
      if (typeof job.result_url === 'string') {
        const trimmed = job.result_url.trim();
        const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
        if (looksLikeJson) {
          try {
            parsedResult = JSON.parse(trimmed);
          } catch (e) {
            console.error('Failed to parse job result_url as JSON:', e);
            parsedResult = job.result_url;
          }
        } else {
          parsedResult = job.result_url;
        }
      } else {
        parsedResult = job.result_url;
      }
    }

    // Return the correct layout contract the React Editor expects
    return res.json({
      status: job.status,
      error: job.error_message || null,
      result: parsedResult,
      result_url: typeof job.result_url === 'string' ? job.result_url : null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;