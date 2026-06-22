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
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowSize.width <= 900;
  const isPortrait = windowSize.height > windowSize.width;
  const showPortraitWarning = isMobile && isPortrait;

  // Mobile drawer panel expansion toggle state
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('captions');
  const [uploadStatus, setUploadStatus] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const project = useProjectStore(s => s.project);
  const setVideoSrc = useProjectStore(s => s.setVideoSrc);
  const addCaption = useProjectStore(s => s.addCaption);

  const hasVideo = Boolean(project.videoSrc) && (project.durationFrames || 0) > 0;
  const fps = project.fps || 30;
  const totalFrames = project.durationFrames || 0;

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setIsPlaying(false);
    setCurrentFrame(0);
    setUploadStatus('Reading video...');
    try {
      const meta = await readVideoMeta(file);
      setUploadStatus('Uploading...');
      const sig = await getUploadSignature();
      const videoUrl = await uploadToCloudinary(file, sig, 'video');
      const projectId = useProjectStore.getState().project.id;
    
      setVideoSrc(videoUrl, Math.round(meta.duration * meta.fps), meta.fps, meta.width, meta.height);
      setUploadStatus('Transcribing...');
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
          setUploadStatus('Failed: ' + job.error); 
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
        setUploadStatus('Error: ' + err.message);
        setIsUploading(false);
      }
    };
    poll();
  };
  
  const handleExport = async () => {
    if (!project.videoSrc) return;
    setIsExporting(true);
    setExportUrl(null);
    setUploadStatus('Queueing export...');
    try {
      const { jobId } = await startExport(project);
      const poll = async () => {
        const job = await getJobStatus(jobId);
        if (job.status === 'queued' || job.status === 'processing') { 
          setUploadStatus('Rendering...');
          setTimeout(poll, 3000); 
          return; 
        }
        if (job.status === 'completed') { 
          const downloadUrl = job.result?.downloadUrl || job.result_url || job.result;
          if (downloadUrl) {
            setExportUrl(downloadUrl);
            setUploadStatus('Done!');
          } else {
            setUploadStatus('URL missing.');
          }
        } else if (job.status === 'failed') {
          setUploadStatus('Failed: ' + (job.error || job.error_message));
        }
        setIsExporting(false);
      };
      poll();
    } catch (err: any) { 
      setUploadStatus('Error: ' + err.message);
      setIsExporting(false); 
    }
  };

  const s = getStyles(isMobile, isMobilePanelOpen);

  return (
    <div style={s.root}>
      {/* ── PORTRAIT TOOLTIP WARNING OVERLAY ── */}
      {showPortraitWarning && (
        <div style={s.portraitOverlay}>
          <div style={s.portraitContent}>
            <div style={s.rotateIcon}>🔄</div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: 20 }}>Landscape Mode Required</h2>
            <p style={{ margin: 0, color: '#a1a1aa', fontSize: 13, lineHeight: 1.5 }}>
              Please tilt your mobile device sideways to start editing your video project timeline.
            </p>
          </div>
        </div>
      )}

      {/* ── TOP BAR ── */}
      <header style={s.topbar}>
        <div style={s.topbarLeft}>
          <span style={s.logo}>▶ Motion</span>
          {uploadStatus && (
            <span style={s.statusPill}>
              <span style={s.dot} />
              <span style={{ fontSize: 11 }}>{uploadStatus}</span>
            </span>
          )}
        </div>
        <div style={s.topbarRight}>
          <button style={s.btnUpload} onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            ↑ {isUploading ? '...' : 'Upload'}
          </button>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          {exportUrl
            ? <a href={exportUrl} target="_blank" rel="noopener noreferrer" style={s.btnExportLink}>⬇ Save</a>
            : <button style={s.btnExport} onClick={handleExport} disabled={isExporting || !hasVideo}>
                {isExporting ? '...' : '⬇ Export'}
              </button>
          }
        </div>
      </header>

      {/* ── WORKSPACE AREA ── */}
      <div style={s.workspace}>
        {/* VIDEO MONITOR STAGE */}
        <div style={s.previewArea} onClick={() => isMobile && isMobilePanelOpen && setIsMobilePanelOpen(false)}>
          <Canvas
            currentFrame={Math.floor(currentFrame)}
            isPlaying={isPlaying}
          />

          <Scrubber
            currentFrame={Math.floor(currentFrame)}
            totalFrames={totalFrames}
            fps={fps}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onTogglePlay={togglePlay}
          />
        </div>

        {/* ── ADJUSTED SLIDER BUTTON (Now shifts position out of the tab region when panel opens) ── */}
        {isMobile && (
          <button 
            style={s.mobilePanelTrigger} 
            onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
          >
            {isMobilePanelOpen ? '✕ Close' : '✦ Edit Tools'}
          </button>
        )}

        {/* ── COMPACT RIGHT PANEL CONTROL SYSTEM ── */}
        <aside style={s.rightPanel}>
          <div style={s.tabBar}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
                onClick={() => setActiveTab(tab.id)}
              >
                <span style={{ fontSize: isMobile ? 15 : 18 }}>{tab.icon}</span>
                {!isMobile && <span>{tab.label}</span>}
              </button>
            ))}
          </div>
          <div style={s.panelBody}>
            {activeTab === 'captions' && <CaptionsTab currentFrame={currentFrame} isPlaying={isPlaying} />}
            {activeTab === 'templates' && <TemplatesTab />}
            {activeTab === 'stickers' && <StickersTab />}
            {activeTab === 'filters' && <FiltersTab />}
          </div>
        </aside>
      </div>
    </div>
  );
};

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
      resolve({ duration: 10, width: 1280, height: 720, fps: 30 });
    };
    video.src = URL.createObjectURL(file);
  });
}

const getStyles = (isMobile: boolean, isMobilePanelOpen: boolean): Record<string, React.CSSProperties> => {
  let mobilePanelStyles: React.CSSProperties = {};
  if (isMobile) {
    mobilePanelStyles = {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 260,
      zIndex: 999,
      boxShadow: '-10px 0 30px rgba(0,0,0,0.6)',
      transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      transform: isMobilePanelOpen ? 'translateX(0)' : 'translateX(100%)',
    };
  }

  return {
    root: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: '#0f0f11', color: '#f0f0f0', fontFamily: 'system-ui,sans-serif', overflow: 'hidden' },
    
    portraitOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 15, 17, 0.96)', backdropFilter: 'blur(12px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    portraitContent: { textAlign: 'center', background: '#18181b', border: '1px solid #2a2a2e', padding: '30px 20px', borderRadius: 16, maxWidth: 320, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' },
    rotateIcon: { fontSize: 44, marginBottom: 12, animation: 'spin 2s linear infinite' },
    
    topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #2a2a2e', background: '#18181b', flexShrink: 0, height: 44 },
    topbarLeft: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
    topbarRight: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
    logo: { fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', flexShrink: 0 },
    statusPill: { display: 'flex', alignItems: 'center', gap: 5, background: '#1e1e24', border: '1px solid #2a2a2e', borderRadius: 20, padding: '2px 8px', color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 },
    dot: { width: 5, height: 5, borderRadius: '50%', background: '#6366f1', flexShrink: 0 },
    
    btnUpload: { background: '#6366f1', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' },
    btnExport: { background: '#10b981', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' },
    btnExportLink: { background: '#10b981', color: '#fff', textDecoration: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, display: 'inline-block' },
    
    workspace: { display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' },
    previewArea: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#0a0a0c', padding: 8, overflow: 'hidden' },
    
    // FIX: Modified position dynamically to slide cleanly alongside the panels and clear the tabs
    mobilePanelTrigger: { 
      position: 'absolute', 
      right: isMobilePanelOpen ? 272 : 12, // Shakes leftward 260px (panel width) + 12px space padding
      top: 12, 
      zIndex: 1000, 
      background: isMobilePanelOpen ? '#ef4444' : '#6366f1', // Green or amber transition optional, crimson matches general 'close' logic cleanly
      color: '#fff', 
      border: 'none', 
      padding: '8px 14px', 
      borderRadius: 30, 
      fontSize: 12, 
      fontWeight: 600, 
      cursor: 'pointer', 
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)', 
      display: 'flex', 
      alignItems: 'center', 
      gap: 4,
      transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease'
    },
    
    rightPanel: { 
      width: 360, 
      background: '#18181b', 
      borderLeft: '1px solid #2a2a2e', 
      display: 'flex', 
      flexDirection: 'column', 
      flexShrink: 0,
      ...mobilePanelStyles 
    },
    tabBar: { display: 'flex', borderBottom: '1px solid #2a2a2e', flexShrink: 0 },
    tab: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: isMobile ? '12px 2px' : '11px 4px', cursor: 'pointer', border: 'none', background: 'none', color: '#a1a1aa', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '2px solid transparent', transition: 'all 0.15s', fontFamily: 'inherit' },
    tabActive: { color: '#6366f1', borderBottomColor: '#6366f1', background: '#1c1c26' },
    panelBody: { flex: 1, overflowY: 'auto', padding: isMobile ? 12 : 16 },
  };
};