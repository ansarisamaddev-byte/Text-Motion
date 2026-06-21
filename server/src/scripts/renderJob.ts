import 'dotenv/config'; 
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { bundle, getCompositions, renderMedia } from '@remotion/renderer';

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
  // Targeting the primary registration entry point index file
  const rootPath = path.resolve(__dirname, '../../../frontend/src/remotion/index.ts');
  if (fs.existsSync(rootPath)) {
    console.log(`[renderJob] Entrypoint verified at: ${rootPath}`);
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
  
  // Package your props inside a cleanly isolated structure matching what MainComposition expects
  const unifiedRemotionProps = { project };

  try {
    const entryPoint = resolveEntryPoint();

    console.log(`[renderJob] Bundling video composition layers...`);
    const serveUrl = await bundle({
      entryPoint,
      // Suppresses warnings within the bundling console stream if needed
      logLevel: 'verbose',
    });

    console.log(`[renderJob] Extracting and verifying target composition configuration trees...`);
    const comps = await getCompositions(serveUrl, {
      inputProps: unifiedRemotionProps,
    });

    const composition = comps.find(c => c.id === 'MainComposition');
    if (!composition) {
      throw new Error(`CRITICAL: Composition ID 'MainComposition' was not found inside Remotion entry definitions.`);
    }

    console.log(`[renderJob] Initializing programmatic headless frame generation loops...`);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: outputPath,
      inputProps: unifiedRemotionProps,
      // Optional: handles Google Fonts verbose download payloads more cleanly
      chromiumOptions: {
        gl: 'swangle',
      }
    });

    console.log(`[renderJob] Render complete! Launching chunked stream upload to Cloudinary...`);
    
    const uploadRes = await cloudinary.uploader.upload_large(outputPath, {
      resource_type: 'video',
      folder: 'caption-editor-uploads',
      chunk_size: 6000000 // 6MB Chunks
    });

    console.log(`[renderJob] Upload successful. Target location: ${uploadRes.secure_url}`);

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