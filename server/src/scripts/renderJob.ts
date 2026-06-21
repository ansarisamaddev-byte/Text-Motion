import 'dotenv/config'; 
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function resolveEntryPoint(): string {
  const rootPath = path.resolve(__dirname, '../../../frontend/src/remotion/index.ts');
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }
  throw new Error(`CRITICAL: Cannot find entrypoint index layout at ${rootPath}`);
}

async function main() {
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('Usage: renderJob.ts <jobId>');
    process.exit(1);
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    console.error(`[renderJob] Could not load job ${jobId}:`, error);
    process.exit(1);
  }

  const project = job.payload?.project;
  if (!project || !project.videoSrc) {
    console.error(`[renderJob] CRITICAL ERROR: payload.project or videoSrc is completely empty inside the database log row.`);
    process.exit(1);
  }

  const buildFolder = path.resolve(__dirname, '../../builds');
  if (!fs.existsSync(buildFolder)) fs.mkdirSync(buildFolder, { recursive: true });

  const outputPath = path.join(buildFolder, `output-${job.id}.mp4`);
  const unifiedRemotionProps = { project };

  try {
    const entryPoint = resolveEntryPoint();
    
    // PERMANENT FIX: Pass ONLY the entryPoint. 
    // This entirely avoids TypeScript complaining about mismatching legacy bundle options.
    // @ts-ignore - Bypassing monorepo type-hoisting ghost errors
    const serveUrl = await bundle({
      entryPoint
    });
    const comps = await getCompositions(serveUrl, {
      inputProps: unifiedRemotionProps,
    });

    const composition = comps.find(c => c.id === 'MainComposition');
    if (!composition) {
      throw new Error(`CRITICAL: Composition ID 'MainComposition' was not found inside Remotion entry definitions.`);
    }
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: outputPath,
      inputProps: unifiedRemotionProps,
      chromiumOptions: {
        gl: 'swangle',
      }
    });

    console.log(`[renderJob] Render complete! Launching chunked stream upload to Cloudinary...`);
    
    const uploadRes = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'caption-editor-uploads',
    });

    if (!uploadRes || !uploadRes.secure_url) {
      console.error(`[renderJob] RAW CLOUDINARY RESPONSE:`, uploadRes);
      throw new Error("Cloudinary finished the upload but failed to return a secure_url.");
    }

    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        result_url: uploadRes.secure_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log(`[renderJob] Successfully finalized processing pipeline for job ${job.id}`);
  } catch (err: any) {
    const detailedError = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    console.error(`[renderJob] Execution Engine Failure:`, detailedError);
    
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: detailedError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    process.exit(1);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}

main();