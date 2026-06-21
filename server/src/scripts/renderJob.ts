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
  const rootPath = path.resolve(
                        __dirname,
                        '../../../frontend/src/remotion/index.ts'
                    );
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
  if (!project || !project.videoSrc) {
    console.error(`[renderJob] CRITICAL ERROR: payload.project or videoSrc is completely empty inside the database log row.`);
    process.exit(1);
  }

  const buildFolder = path.resolve(__dirname, '../../builds');
  if (!fs.existsSync(buildFolder)) fs.mkdirSync(buildFolder, { recursive: true });

  const configPath = path.join(buildFolder, `project-${job.id}.json`);
  const outputPath = path.join(buildFolder, `output-${job.id}.mp4`);

  const unifiedRemotionProps = {
    project: project
  };

  fs.writeFileSync(configPath, JSON.stringify(unifiedRemotionProps, null, 2));
  try {
    const entryPoint = path.resolve(
                            __dirname,
                            '../../../frontend/src/remotion/index.ts'
                        );

    const props = JSON.stringify({
        project,
    }).replace(/"/g, '\\"');
    
    // FIX: Changed --props to --props-src so Remotion processes it as a configuration file path
    const renderCommand = `npx remotion render "${entryPoint}" MainComposition "${outputPath}" --props="${props}"`;
    
    console.log(`[renderJob] Executing: ${renderCommand}`);
    const { stdout, stderr } = await execAsync(renderCommand);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

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