import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from './store/projectStore';
import { CaptionsTab } from './tabs/CaptionsTab';
import { TemplatesTab } from './tabs/TemplatesTab';
import { StickersTab } from './tabs/StickersTab';
import { FiltersTab } from './tabs/FiltersTab';
import { Canvas } from './Canvas';
import { Scrubber } from './Scrubber';
import { getUploadSignature, uploadToCloudinary, startTranscription, getJobStatus, startExport } from './api';
import type { Caption } from './types';
import { createDefaultCaptionStyle } from './utils/defaultStyle';

type TabId = 'captions' | 'templates' | 'stickers' | 'filters';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'captions', label: 'Captions', icon: '✦' },
  { id: 'templates', label: 'Templates', icon: '⊞' },
  { id: 'stickers', label: 'Stickers', icon: '☺' },
  { id: 'filters', label: 'Filters', icon: '⊙' },
];

export const Editor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('captions');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  // Playback state managed here, passed down to Canvas + Scrubber
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore(s => s.project);
  const setVideoSrc = useProjectStore(s => s.setVideoSrc);
  const addCaption = useProjectStore(s => s.addCaption);

  // FIXED: Reading durationFrames from the store setup to unlock playback/export
  const hasVideo = Boolean(project.videoSrc) && (project.durationFrames || 0) > 0;
  const fps = project.fps || 30;
  const totalFrames = project.durationFrames || 0;

  // ── Playback engine ────────────────────────────────────────────────────────
  const tick = useCallback((now: number) => {
    if (!lastTickRef.current) lastTickRef.current = now;
    const delta = now - lastTickRef.current;
    lastTickRef.current = now;
    setCurrentFrame(prev => {
      const next = prev + (delta / 1000) * fps;
      if (next >= totalFrames) { setIsPlaying(false); return 0; }
      return next;
    });
    rafRef.current = requestAnimationFrame(tick);
  }, [fps, totalFrames]);

  useEffect(() => {
    if (isPlaying) {
      lastTickRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, tick]);

  const togglePlay = useCallback(() => {
    if (!hasVideo) return;
    setIsPlaying(p => !p);
  }, [hasVideo]);

  useSpacebarPlay(togglePlay);

  const handleSeek = (frame: number) => {
    setCurrentFrame(Math.max(0, Math.min(totalFrames, frame)));
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setIsPlaying(false);
    setCurrentFrame(0);
    setUploadStatus('Reading video...');
    try {
      const meta = await readVideoMeta(file);
      setUploadStatus('Uploading to cloud...');
      const sig = await getUploadSignature();
      const videoUrl = await uploadToCloudinary(file, sig, 'video');
      const projectId = useProjectStore.getState().project.id;
    
      console.log('[DEBUG] Retrieved Project ID from store:', projectId);
      setVideoSrc(videoUrl, Math.round(meta.duration * meta.fps), meta.fps, meta.width, meta.height);
      setUploadStatus('Transcribing audio...');
      const { task_id } = await startTranscription(videoUrl, projectId);
      pollTranscription(task_id);
    } catch (err: any) {
      setUploadStatus('Error: ' + err.message);
      setIsUploading(false);
    }
    e.target.value = '';
  };

  const pollTranscription = (taskId: string) => {
    const poll = async () => {
      try {
        const job = await getJobStatus(taskId);
        if (job.status === 'queued' || job.status === 'processing') { 
          setTimeout(poll, 2500); 
          return; 
        }
        if (job.status === 'failed') { 
          setUploadStatus('Transcription failed: ' + job.error); 
          setIsUploading(false); 
          return; 
        }
        
        let chunks: any[] = [];
        if (job.result) {
          chunks = Array.isArray(job.result) 
            ? job.result 
            : (typeof job.result === 'string' ? JSON.parse(job.result) : []);
        }

        const style = createDefaultCaptionStyle();
        chunks.forEach((chunk: any, i: number) => {
          addCaption({
            id: `c-${i}-${Date.now()}`,
            text: chunk.text || chunk.words?.map((w: any) => w.text).join(' ') || '',
            start: chunk.start,
            end: chunk.end,
            words: chunk.words,
            style: JSON.parse(JSON.stringify(style)),
          } as Caption);
        });

        setUploadStatus('');
        setIsUploading(false);
      } catch (err: any) {
        console.error("Transcription Polling Failure:", err);
        setUploadStatus('Error: ' + err.message);
        setIsUploading(false);
      }
    };
    poll();
  };
  
  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!project.videoSrc) return;
    setIsExporting(true);
    setExportUrl(null);
    setUploadStatus('Queuing render export job...');
    try {
      const { jobId } = await startExport(project);
      
      const poll = async () => {
        const job = await getJobStatus(jobId);
        if (job.status === 'queued' || job.status === 'processing') { 
          setUploadStatus('Rendering video via GitHub Actions...');
          setTimeout(poll, 3000); 
          return; 
        }
        if (job.status === 'completed') { 
          const downloadUrl = job.result?.downloadUrl || job.result_url || job.result;
          if (downloadUrl) {
            setExportUrl(downloadUrl);
            setUploadStatus('Export complete!');
          } else {
            setUploadStatus('Export completed, but download URL missing.');
          }
        } else if (job.status === 'failed') {
          setUploadStatus('Export pipeline execution failed: ' + (job.error || job.error_message));
        }
        setIsExporting(false);
      };
      poll();
    } catch (err: any) { 
      console.error("Export failure:", err);
      setUploadStatus('Export connection error: ' + err.message);
      setIsExporting(false); 
    }
  };

  return (
    <div style={s.root}>
      {/* ── TOP BAR ── */}
      <header style={s.topbar}>
        <div style={s.topbarLeft}>
          <span style={s.logo}>▶ Text Motion</span>
          {uploadStatus && (
            <span style={s.statusPill}>
              <span style={s.dot} />
              {uploadStatus}
            </span>
          )}
        </div>
        <div style={s.topbarRight}>
          <button style={s.btnUpload} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            ↑ {isUploading ? 'Processing...' : 'Upload Video'}
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          {exportUrl
            ? <a href={exportUrl} target="_blank" rel="noopener noreferrer" style={s.btnExportLink}>⬇ Download</a>
            : <button style={s.btnExport} onClick={handleExport} disabled={isExporting || !hasVideo}>
                {isExporting ? 'Exporting...' : '⬇ Export Video'}
              </button>
          }
        </div>
      </header>

      {/* ── WORKSPACE ── */}
      <div style={s.workspace}>
        {/* CANVAS AREA */}
        <div style={s.previewArea}>
          <Canvas
            currentFrame={Math.floor(currentFrame)}
            isPlaying={isPlaying}
          />

          {/* Scrubber below canvas */}
          <Scrubber
            currentFrame={Math.floor(currentFrame)}
            totalFrames={totalFrames}
            fps={fps}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onTogglePlay={togglePlay}
          />

          {/* Keyboard shortcut hint */}
          <p style={{ fontSize: 11, color: '#444', marginTop: 2 }}>
            Space to play · Click elements on canvas to select · Drag to move
          </p>
        </div>

        {/* RIGHT PANEL */}
        <aside style={s.rightPanel}>
          <div style={s.tabBar}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
                onClick={() => setActiveTab(tab.id)}
              >
                <span style={{ fontSize: 18 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div style={s.panelBody}>
            {activeTab === 'captions' && (
              <CaptionsTab 
                currentFrame={currentFrame} 
                isPlaying={isPlaying} 
              />
            )}
            {activeTab === 'templates' && <TemplatesTab />}
            {activeTab === 'stickers' && <StickersTab />}
            {activeTab === 'filters' && <FiltersTab />}
          </div>
        </aside>
      </div>
    </div>
  );
};

// ── Keyboard shortcut: Space = play/pause ─────────────────────────────────────
function useSpacebarPlay(togglePlay: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePlay]);
}

function readVideoMeta(file: File): Promise<{ duration: number; width: number; height: number; fps: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      const duration = video.duration && !isNaN(video.duration) ? video.duration : 10;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      
      resolve({ duration, width, height, fps: 30 });
      URL.revokeObjectURL(video.src);
    };
    
    video.onerror = () => {
      console.warn('Could not read video metadata natively, using standard layout fallbacks.');
      resolve({ duration: 10, width: 1280, height: 720, fps: 30 });
    };
    
    video.src = URL.createObjectURL(file);
  });
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f11', color: '#f0f0f0', fontFamily: 'system-ui,sans-serif', overflow: 'hidden' },
  topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #2a2a2e', background: '#18181b', flexShrink: 0, height: 52 },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  topbarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  statusPill: { display: 'flex', alignItems: 'center', gap: 6, background: '#1e1e24', border: '1px solid #2a2a2e', borderRadius: 20, padding: '3px 12px', fontSize: 12, color: '#a1a1aa' },
  dot: { width: 6, height: 6, borderRadius: '50%', background: '#6366f1', flexShrink: 0 },
  btnUpload: { background: '#6366f1', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },
  btnExport: { background: '#10b981', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' },
  btnExportLink: { background: '#10b981', color: '#fff', textDecoration: 'none', padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, display: 'inline-block' },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden' },
  previewArea: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#0a0a0c', padding: 16 },
  rightPanel: { width: 360, background: '#18181b', borderLeft: '1px solid #2a2a2e', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  tabBar: { display: 'flex', borderBottom: '1px solid #2a2a2e', flexShrink: 0 },
  tab: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '11px 4px', cursor: 'pointer', border: 'none', background: 'none', color: '#a1a1aa', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const, borderBottom: '2px solid transparent', transition: 'all 0.15s', fontFamily: 'inherit' },
  tabActive: { color: '#6366f1', borderBottomColor: '#6366f1', background: '#1c1c26' },
  panelBody: { flex: 1, overflowY: 'auto' as const, padding: 16 },
};