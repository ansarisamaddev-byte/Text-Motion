import type { Project } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
}

/** Get a signed Cloudinary upload params from our backend (keeps API secret server-side). */
export async function getUploadSignature(): Promise<CloudinarySignature> {
  console.log(`Backend`, API_BASE_URL)
  const res = await fetch(`${API_BASE_URL}/api/upload/signature`);
  if (!res.ok) throw new Error('Failed to get upload signature');
  return res.json();
}

/** Upload a file directly to Cloudinary (unsigned-free flow using a signed request). */
export async function uploadToCloudinary(file: File, sig: CloudinarySignature, resourceType: 'video' | 'image' = 'video'): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', sig.apiKey);
  formData.append('timestamp', String(sig.timestamp));
  formData.append('signature', sig.signature);
  formData.append('folder', sig.folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error('Cloudinary upload failed');
  const data = await res.json();
  return data.secure_url as string;
}

export interface TranscribeResponse {
  task_id: string;
}

export async function startTranscription(videoUrl: string, projectId: string): Promise<TranscribeResponse> {
  const res = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, projectId }),
  });
  if (!res.ok) throw new Error('Failed to start transcription');
  return res.json();
}

export interface JobStatus {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error?: string | null;
  error_message?: string | null;
  result?: any;
  result_url?: string | null;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  // Try calling the configured jobs endpoint
  let res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
  
  // NATIVE FALLBACK: If your backend route is registered as singular /api/job instead of plural /api/jobs
  if (res.status === 404) {
    res = await fetch(`${API_BASE_URL}/api/job/${jobId}`);
  }
  
  if (!res.ok) {
    throw new Error(`Failed to fetch job status. Engine returned status code: ${res.status}`);
  }
  return res.json();
}

export async function startExport(project: Project): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE_URL}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, projectId: project.id }),
  });
  if (!res.ok) throw new Error('Failed to start export render request pipeline.');
  return res.json();
}

export async function fetchPresets() {
  const res = await fetch(`${API_BASE_URL}/api/presets`);
  if (!res.ok) throw new Error('Failed to fetch presets');
  return res.json();
}