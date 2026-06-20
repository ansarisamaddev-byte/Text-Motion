import React from 'react';
import { useProjectStore } from '../store/projectStore';
import type { CaptionStyle } from '../types';
import { SectionTitle } from './ui';

interface Template {
  id: string;
  name: string;
  description: string;
  preview: React.CSSProperties;
  previewText: React.CSSProperties;
  style: Partial<CaptionStyle>;
}

const TEMPLATES: Template[] = [
  {
    id: 'bold-yellow',
    name: 'Bold Yellow',
    description: 'Classic social media style',
    preview: { background: '#111' },
    previewText: { background: 'rgba(0,0,0,0.7)', color: '#FFD700', fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 4 },
    style: { fontFamily: 'Inter Bold', fontSize: 48, color: '#FFD700', backgroundColor: { r: 0, g: 0, b: 0, a: 0.7 }, borderRadius: 8, position: { x: 'center', y: 80 }, animation: 'pop' },
  },
  {
    id: 'clean-white',
    name: 'Clean White',
    description: 'Minimal no-background',
    preview: { background: '#222' },
    previewText: { color: '#fff', fontWeight: 700, fontSize: 12, padding: '3px 8px' },
    style: { fontFamily: 'Inter Bold', fontSize: 52, color: '#ffffff', backgroundColor: { r: 0, g: 0, b: 0, a: 0 }, borderRadius: 0, position: { x: 'center', y: 78 }, animation: 'fade' },
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    description: 'Word-by-word highlight',
    preview: { background: '#1a1a2e' },
    previewText: { background: 'rgba(0,0,0,0.5)', padding: '3px 8px', borderRadius: 6, fontSize: 11 },
    style: { fontFamily: 'Montserrat', fontSize: 48, color: '#ffffff', highlightColor: '#39FF14', backgroundColor: { r: 0, g: 0, b: 0, a: 0.45 }, borderRadius: 12, position: { x: 'center', y: 78 }, animation: 'karaoke' },
  },
  {
    id: 'top-banner',
    name: 'Top Banner',
    description: 'White bar at the top',
    preview: { background: '#0a0a0a', alignItems: 'flex-start', paddingTop: 10 },
    previewText: { background: 'rgba(255,255,255,0.9)', color: '#111', fontWeight: 700, fontSize: 10, padding: '4px 12px', borderRadius: 4, width: '90%', textAlign: 'center' },
    style: { fontFamily: 'Inter Bold', fontSize: 40, color: '#111111', backgroundColor: { r: 255, g: 255, b: 255, a: 0.88 }, borderRadius: 6, position: { x: 'center', y: 10 }, animation: 'slide-up' },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    description: 'Bright green on dark',
    preview: { background: '#050505' },
    previewText: { color: '#39FF14', fontWeight: 800, fontSize: 12, padding: '3px 8px' },
    style: { fontFamily: 'Montserrat', fontSize: 50, color: '#39FF14', backgroundColor: { r: 0, g: 0, b: 0, a: 0 }, borderRadius: 0, position: { x: 'center', y: 80 }, animation: 'pop' },
  },
  {
    id: 'purple-pill',
    name: 'Purple Pill',
    description: 'Rounded pill background',
    preview: { background: '#1a0a2e' },
    previewText: { background: '#6366f1', color: '#fff', fontWeight: 800, fontSize: 10, padding: '4px 12px', borderRadius: 20 },
    style: { fontFamily: 'Poppins', fontSize: 46, color: '#ffffff', backgroundColor: { r: 99, g: 102, b: 241, a: 1 }, borderRadius: 24, position: { x: 'center', y: 80 }, animation: 'pop' },
  },
  {
    id: 'red-hot',
    name: 'Red Hot',
    description: 'High energy red style',
    preview: { background: '#111' },
    previewText: { background: '#ef4444', color: '#fff', fontWeight: 900, fontSize: 11, padding: '3px 10px', borderRadius: 4 },
    style: { fontFamily: 'Oswald', fontSize: 52, color: '#ffffff', backgroundColor: { r: 239, g: 68, b: 68, a: 1 }, borderRadius: 4, position: { x: 'center', y: 80 }, animation: 'zoom' },
  },
  {
    id: 'subtle-dark',
    name: 'Subtle Dark',
    description: 'Low-key dark overlay',
    preview: { background: '#1a1a1a' },
    previewText: { background: 'rgba(0,0,0,0.5)', color: '#e0e0e0', fontSize: 11, padding: '4px 10px', borderRadius: 6 },
    style: { fontFamily: 'Roboto', fontSize: 38, color: '#e0e0e0', backgroundColor: { r: 0, g: 0, b: 0, a: 0.5 }, borderRadius: 8, position: { x: 'center', y: 82 }, animation: 'fade' },
  },
];

export const TemplatesTab: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const selectedId = useProjectStore(s => s.selectedCaptionId);
  const applyPreset = useProjectStore(s => s.applyPresetToCaption);
  const updateAllCaptions = (style: Partial<CaptionStyle>) => {
    project.captions.forEach(c => applyPreset(c.id, { ...createDefaultFromPartial(style) }));
  };
  const [selected, setSelected] = React.useState('bold-yellow');

  const apply = (t: Template) => {
    setSelected(t.id);
    if (selectedId) {
      applyPreset(selectedId, createDefaultFromPartial(t.style));
    } else {
      updateAllCaptions(t.style);
    }
  };

  return (
    <div>
      <SectionTitle>Preset templates</SectionTitle>
      <p style={{ fontSize: 12, color: '#555', marginBottom: 14 }}>
        {selectedId ? 'Applies to selected caption' : 'Applies to all captions'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {TEMPLATES.map(t => (
          <div
            key={t.id}
            onClick={() => apply(t)}
            style={{
              background: '#1e1e24',
              border: `1px solid ${selected === t.id ? '#6366f1' : '#2a2a2e'}`,
              borderRadius: 10, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {/* Preview */}
            <div style={{ height: 72, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 8, ...t.preview }}>
              <span style={t.previewText}>{t.name}</span>
            </div>
            {/* Label */}
            <div style={{ padding: '7px 10px', borderTop: '1px solid #2a2a2e' }}>
              <p style={{ fontSize: 12, color: selected === t.id ? '#6366f1' : '#ccc', fontWeight: 600, margin: 0 }}>{t.name}</p>
              <p style={{ fontSize: 11, color: '#555', margin: '2px 0 0' }}>{t.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function createDefaultFromPartial(partial: Partial<CaptionStyle>): CaptionStyle {
  return {
    fontFamily: 'Inter Bold',
    fontSize: 48,
    color: '#FFD700',
    backgroundColor: { r: 0, g: 0, b: 0, a: 0.7 },
    borderRadius: 8,
    position: { x: 'center', y: 80 },
    animation: 'pop',
    highlightColor: '#39FF14',
    highlightWords: [],
    ...partial,
  } as CaptionStyle;
}
