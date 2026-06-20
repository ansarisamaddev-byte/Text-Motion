import React, { useRef, useCallback } from 'react';

interface ScrubberProps {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
  onSeek: (frame: number) => void;
  onTogglePlay: () => void;
}

function formatTime(frames: number, fps: number) {
  const s = frames / fps;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec}.${ms}`;
}

export const Scrubber: React.FC<ScrubberProps> = ({
  currentFrame, totalFrames, fps, isPlaying, onSeek, onTogglePlay,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const getFrameFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(ratio * totalFrames);
  }, [totalFrames]);

  const onTrackMouseDown = (e: React.MouseEvent) => {
    onSeek(getFrameFromEvent(e));
    const onMove = (me: MouseEvent) => onSeek(getFrameFromEvent(me));
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const progress = totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: 340 }}>
      {/* Play/pause */}
      <button
        onClick={onTogglePlay}
        style={{
          background: '#1e1e24', border: '1px solid #2a2a2e', color: '#fff',
          width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
          fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontFamily: 'inherit',
        }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Time */}
      <span style={{ fontSize: 11, color: '#888', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(currentFrame, fps)}
      </span>

      {/* Track */}
      <div
        ref={trackRef}
        onMouseDown={onTrackMouseDown}
        style={{
          flex: 1, height: 20, cursor: 'pointer',
          display: 'flex', alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Rail */}
        <div style={{ position: 'absolute', left: 0, right: 0, height: 4, background: '#2a2a2e', borderRadius: 2 }}>
          {/* Fill */}
          <div style={{ width: `${progress}%`, height: '100%', background: '#6366f1', borderRadius: 2, transition: 'width 0.05s linear' }} />
        </div>
        {/* Thumb */}
        <div style={{
          position: 'absolute',
          left: `calc(${progress}% - 6px)`,
          width: 12, height: 12, borderRadius: '50%',
          background: '#6366f1', border: '2px solid #fff',
          boxShadow: '0 0 0 2px rgba(99,102,241,0.4)',
          transition: 'left 0.05s linear',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Duration */}
      <span style={{ fontSize: 11, color: '#555', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(totalFrames, fps)}
      </span>
    </div>
  );
};
