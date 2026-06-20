import React from 'react';
import { useProjectStore } from '../store/projectStore';
import type { FilterType } from '../types';
import { SectionTitle, Divider, SliderRow } from './ui';

const FILTERS: { type: FilterType; name: string; preview: string; description: string }[] = [
  { type: 'none', name: 'None', preview: 'linear-gradient(135deg,#1a1a1e,#2a2a2e)', description: 'Original' },
  { type: 'grayscale', name: 'Grayscale', preview: 'linear-gradient(135deg,#777,#bbb)', description: 'Black & white' },
  { type: 'sepia', name: 'Sepia', preview: 'linear-gradient(135deg,#8b6c42,#c4a882)', description: 'Warm vintage' },
  { type: 'vintage', name: 'Vintage', preview: 'linear-gradient(135deg,#5a4a2a,#8a7a4a)', description: 'Retro look' },
  { type: 'contrast', name: 'Contrast', preview: 'linear-gradient(135deg,#000,#666)', description: 'High contrast' },
  { type: 'brightness', name: 'Brighten', preview: 'linear-gradient(135deg,#d4e8ff,#fff9e0)', description: 'Lighter & airy' },
];

const OVERLAYS = [
  { id: 'overlay-vignette', type: 'vignette', name: 'Vignette', color: 'radial-gradient(ellipse, transparent 50%, rgba(0,0,0,0.8) 100%)' },
  { id: 'overlay-light-leak', type: 'light-leak', name: 'Light leak', color: 'linear-gradient(45deg,rgba(255,200,100,0.3),transparent)' },
  { id: 'overlay-film-grain', type: 'film-grain', name: 'Film grain', color: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.02) 0px,rgba(0,0,0,0.02) 1px)' },
  { id: 'overlay-cool-tone', type: 'cool-tone', name: 'Cool tone', color: 'linear-gradient(135deg,rgba(0,150,255,0.2),transparent)' },
];

export const FiltersTab: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const addFilter = useProjectStore(s => s.addFilter);
  const updateFilter = useProjectStore(s => s.updateFilter);
  const removeFilter = useProjectStore(s => s.removeFilter);

  const globalFilter = project.filters.find(f => f.id === 'global');
  const activeType = globalFilter?.type || 'none';
  const intensity = globalFilter?.intensity ?? 0.6;
  const duration = project.durationFrames / (project.fps || 30);

  // Sync state controls to store-based adjustment layers
  const brightnessFilter = project.filters.find(f => f.id === 'adjust-brightness');
  const contrastFilter = project.filters.find(f => f.id === 'adjust-contrast');
  const saturationFilter = project.filters.find(f => f.id === 'adjust-saturation');

  const brightness = brightnessFilter ? Math.round(brightnessFilter.intensity * 100) : 100;
  const contrast = contrastFilter ? Math.round(contrastFilter.intensity * 100) : 100;
  const saturation = saturationFilter ? Math.round(saturationFilter.intensity * 100) : 100;

  const applyFilter = (type: FilterType) => {
    if (type === 'none') { removeFilter('global'); return; }
    if (globalFilter) {
      updateFilter('global', { type });
    } else {
      addFilter({ id: 'global', type, intensity: 0.6, start: 0, end: duration || 999 });
    }
  };

  const handleAdjustmentChange = (id: string, type: string, value: number) => {
    const currentFilter = project.filters.find(f => f.id === id);
    if (value === 100) {
      removeFilter(id);
    } else if (currentFilter) {
      updateFilter(id, { intensity: value / 100 });
    } else {
      addFilter({ id, type: type as any, intensity: value / 100, start: 0, end: duration || 999 });
    }
  };

  return (
    <div>
      <SectionTitle>Video filters</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {FILTERS.map(f => (
          <div
            key={f.type}
            onClick={() => applyFilter(f.type)}
            style={{
              background: '#1e1e24',
              border: `1px solid ${activeType === f.type ? '#6366f1' : '#2a2a2e'}`,
              borderRadius: 8, cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s',
            }}
          >
            <div style={{ height: 48, background: f.preview, borderRadius: '8px 8px 0 0' }} />
            <div style={{ padding: '6px 6px 7px' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: activeType === f.type ? '#6366f1' : '#ccc', margin: 0 }}>{f.name}</p>
              <p style={{ fontSize: 10, color: '#555', margin: '1px 0 0' }}>{f.description}</p>
            </div>
          </div>
        ))}
      </div>

      {activeType !== 'none' && (
        <SliderRow
          label="Intensity"
          min={0} max={100}
          value={Math.round(intensity * 100)}
          unit="%"
          onChange={v => updateFilter('global', { intensity: v / 100 })}
        />
      )}

      <Divider />
      <SectionTitle>Adjustments</SectionTitle>
      <SliderRow label="Brightness" min={0} max={200} value={brightness} unit="%" onChange={v => handleAdjustmentChange('adjust-brightness', 'brightness-adj', v)} />
      <SliderRow label="Contrast" min={0} max={200} value={contrast} unit="%" onChange={v => handleAdjustmentChange('adjust-contrast', 'contrast-adj', v)} />
      <SliderRow label="Saturation" min={0} max={200} value={saturation} unit="%" onChange={v => handleAdjustmentChange('adjust-saturation', 'saturate-adj', v)} />

      <Divider />
      <SectionTitle>Overlays</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {OVERLAYS.map(o => {
          const isOverlayActive = project.filters.some(f => f.id === o.id);
          return (
            <button
              key={o.id}
              onClick={() => {
                if (isOverlayActive) {
                  removeFilter(o.id);
                } else {
                  addFilter({ id: o.id, type: o.type as any, intensity: 1, start: 0, end: duration || 999 });
                }
              }}
              style={{
                background: '#1e1e24', 
                border: `1px solid ${isOverlayActive ? '#6366f1' : '#2a2a2e'}`, 
                borderRadius: 8,
                padding: 0, cursor: 'pointer', overflow: 'hidden', fontFamily: 'inherit',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ height: 36, background: o.color, borderRadius: '8px 8px 0 0' }} />
              <p style={{ fontSize: 11, color: isOverlayActive ? '#6366f1' : '#aaa', padding: '5px 8px', margin: 0, fontWeight: isOverlayActive ? 600 : 400 }}>{o.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};