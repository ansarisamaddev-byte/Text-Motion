import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { FilterClip } from '../../types';

interface FilterLayerProps {
  filters: FilterClip[];
  fps: number;
  children: React.ReactNode;
}

export const FilterLayer: React.FC<FilterLayerProps> = ({ filters, fps, children }) => {
  const frame = useCurrentFrame();
  const { fps: compFps } = useVideoConfig();
  const currentTime = frame / (fps || compFps);

  // Accumulate all active filters for this specific timestamp
  const activeFilters = filters.filter((f) => currentTime >= f.start && currentTime <= f.end);

  const parts: string[] = [];
  for (const f of activeFilters) {
    if (f.id === 'global') {
      const clamped = Math.max(0, Math.min(1, f.intensity));
      if (f.type === 'grayscale') parts.push(`grayscale(${clamped})`);
      else if (f.type === 'sepia') parts.push(`sepia(${clamped})`);
      else if (f.type === 'contrast') parts.push(`contrast(${100 + clamped * 80}%)`);
      else if (f.type === 'brightness') parts.push(`brightness(${100 + clamped * 50}%)`);
      else if (f.type === 'vintage') {
        parts.push(`sepia(${clamped * 0.6}) contrast(${100 + clamped * 20}%) brightness(${100 - clamped * 10}%) saturate(${100 - clamped * 30}%)`);
      }
    } else if (f.id === 'adjust-brightness') {
      parts.push(`brightness(${f.intensity})`);
    } else if (f.id === 'adjust-contrast') {
      parts.push(`contrast(${f.intensity})`);
    } else if (f.id === 'adjust-saturation') {
      parts.push(`saturate(${f.intensity})`);
    }
  }
  const filterString = parts.length > 0 ? parts.join(' ') : 'none';

  const OVERLAYS_MAP: Record<string, string> = {
    'overlay-vignette': 'radial-gradient(ellipse, transparent 50%, rgba(0,0,0,0.8) 100%)',
    'overlay-light-leak': 'linear-gradient(45deg,rgba(255,200,100,0.3),transparent)',
    'overlay-film-grain': 'repeating-linear-gradient(45deg,rgba(255,255,255,0.02) 0px,rgba(0,0,0,0.02) 1px)',
    'overlay-cool-tone': 'linear-gradient(135deg,rgba(0,150,255,0.2),transparent)',
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div style={{ width: '100%', height: '100%', filter: filterString }}>
        {children}
      </div>
      {activeFilters.map((f) => {
        const bg = OVERLAYS_MAP[f.id];
        if (!bg) return null;
        return (
          <div
            key={f.id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: bg,
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </div>
  );
};