import 'dotenv/config'; 
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

const execAsync = promisify(exec);

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
  const rootPath = path.resolve(__dirname, '../../../frontend/src/remotion/Root.tsx');
  if (fs.existsSync(rootPath)) {
    console.log(`[renderJob] Found Root file at: ${rootPath}`);
    return rootPath;
  }
  throw new Error(`CRITICAL: Cannot find Root.tsx at ${rootPath}`);
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
  console.log("SUPABASE PROJECT");
  console.log(JSON.stringify(project, null, 2));

  // ── DEFENSIIVE PAYLOAD CHECK ──
  if (!project || !project.videoSrc) {
    console.error(`[renderJob] CRITICAL ERROR: payload.project or videoSrc is completely empty inside the database log row.`);
    process.exit(1);
  }

  console.log(`[renderJob] Found valid payload video resource target: ${project.videoSrc}`);

  const buildFolder = path.resolve(__dirname, '../../builds');
  if (!fs.existsSync(buildFolder)) fs.mkdirSync(buildFolder, { recursive: true });

  const configPath = path.join(buildFolder, `project-${job.id}.json`);
  const outputPath = path.join(buildFolder, `output-${job.id}.mp4`);

  // Fix Culprit #1: Nest the project object so both calculateMetadata and MainComposition read the identical tree structure
  const unifiedRemotionProps = {
    project: project
  };

  fs.writeFileSync(configPath, JSON.stringify(unifiedRemotionProps, null, 2));
    console.log("CONFIG PATH:", configPath);
  console.log("CONFIG CONTENT:");
  console.log(fs.readFileSync(configPath, "utf8"));
  try {
    const entryPoint = resolveEntryPoint();
    console.log(`[renderJob] Using entry point: ${entryPoint}`);
    
    // Fix Culprit #2: Change from --props to --props-src so Remotion treats the string argument as a file path location
    const renderCommand =
  `npx remotion render "${entryPoint}" MainComposition "${outputPath}" --props="${configPath}"`;
    
    console.log(`[renderJob] Executing: ${renderCommand}`);
    const { stdout, stderr } = await execAsync(renderCommand);

    console.log(stdout);
    console.error(stderr);

    console.log(`[renderJob] Uploading rendered video to Cloudinary...`);
    
    const uploadRes = await cloudinary.uploader.upload(outputPath, {
      resource_type: 'video',
      folder: 'caption-editor-uploads',
    });

    console.log(`[renderJob] Upload successful. URL: ${uploadRes.secure_url}`);

    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        result_url: uploadRes.secure_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log(`[renderJob] Successfully completed job ${job.id}`);
  } catch (err: any) {
    console.error(`[renderJob] Failed:`, err.message);
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: err.message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    process.exit(1);
  } finally {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
}

main();