import React, { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { Caption, CaptionStyle, RGBA } from '../types';
import { createDefaultCaptionStyle } from '../utils/defaultStyle';
import { SectionTitle, Divider, SliderRow, ColorSwatches, BadgeGroup, GridButtons } from './ui';

const TEXT_COLORS = ['#FFD700', '#ffffff', '#ff3b30', '#39FF14', '#00c2ff', '#ff69b4', '#ff9500'];
const BG_COLORS = ['rgba(0,0,0,0.75)', 'rgba(255,255,255,0.15)', '#6366f1', '#10b981', '#ef4444', 'transparent'];

const FONTS = [
  'DejaVu Sans Bold',
  'Blackburn Free',
  'Worldstar Regular',
  'Sugiono',
  'Cintaly',
  'Blankit',
  'Inter Bold', 
  'Poppins', 
  'Roboto', 
  'Montserrat', 
  'Oswald', 
  'Pacifico'
];

const ANIMATIONS = ['none', 'fade', 'pop', 'slide-up', 'karaoke', 'bounce', 'typewriter', 'zoom', 'shake'];

// Updated to use numerical percentages for precise free-dragging compatibility
const POSITIONS = [
  { label: '↖', value: { x: 10, y: 15 } }, { label: '↑', value: { x: 50, y: 15 } }, { label: '↗', value: { x: 90, y: 15 } },
  { label: '←', value: { x: 10, y: 50 } }, { label: '·', value: { x: 50, y: 50 } }, { label: '→', value: { x: 90, y: 50 } },
  { label: '↙', value: { x: 10, y: 80 } }, { label: '↓', value: { x: 50, y: 80 } }, { label: '↘', value: { x: 90, y: 80 } },
];

function rgbaToHex(color: string): string {
  if (color.startsWith('#')) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}

function hexToRgba(hex: string, a: number): RGBA {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a };
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

export const CaptionsTab: React.FC = () => {
  const project = useProjectStore(s => s.project);
  const selectedId = useProjectStore(s => s.selectedCaptionId);
  const selectCaption = useProjectStore(s => s.selectCaption);
  const addCaption = useProjectStore(s => s.addCaption);
  const removeCaption = useProjectStore(s => s.removeCaption);
  const updateCaptionStyle = useProjectStore(s => s.updateCaptionStyle);
  const [newText, setNewText] = useState('');

  // Fallback to the first caption if 'bulk' mode is active to populate style sliders
  const selectedCaption = project.captions.find(c => c.id === selectedId) || (selectedId === 'bulk' ? project.captions[0] : undefined);

  const handleAdd = () => {
    if (!newText.trim()) return;
    const lastEnd = project.captions.length > 0 ? Math.max(...project.captions.map(c => c.end)) : 0;
    const cap: Caption = {
      id: `cap-${Date.now()}`,
      text: newText.trim(),
      start: lastEnd,
      end: lastEnd + 3,
      style: {
        ...createDefaultCaptionStyle(),
        position: { x: 50, y: 80 } 
      } as CaptionStyle, // Explicitly cast to strict schema
    };
    addCaption(cap);
    selectCaption(cap.id);
    setNewText('');
  };

  const set = (changes: Partial<CaptionStyle>) => {
    if (!selectedId) return;
    if (selectedId === 'bulk') {
      project.captions.forEach(c => {
        updateCaptionStyle(c.id, changes);
      });
    } else {
      updateCaptionStyle(selectedId, changes);
    }
  };

  // Dedicated direct state mutation handler for specific segment timing configurations
  const updateCaptionTiming = (id: string, changes: Partial<{ start: number; end: number }>) => {
    useProjectStore.setState(state => ({
      project: {
        ...state.project,
        captions: state.project.captions.map(c =>
          c.id === id ? { ...c, ...changes } : c
        ),
      },
    }));
  };

  const style = selectedCaption?.style;
  const bgColor = style ? rgbaToHex(
    typeof style.backgroundColor === 'string'
      ? style.backgroundColor
      : `rgba(${style.backgroundColor.r},${style.backgroundColor.g},${style.backgroundColor.b},${style.backgroundColor.a})`
  ) : '#000000';
  const bgOpacity = style
    ? typeof style.backgroundColor === 'string'
      ? style.backgroundColor === 'transparent' ? 0 : 75
      : Math.round(style.backgroundColor.a * 100)
    : 75;

  const words = selectedCaption?.text.split(/\s+/).filter(Boolean) || [];

  return (
    <div>
      <SectionTitle>Captions ({project.captions.length})</SectionTitle>

      {/* Bulk Action Button */}
      {project.captions.length > 0 && (
        <div
          onClick={() => selectCaption(selectedId === 'bulk' ? null : 'bulk')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px',
            background: selectedId === 'bulk' ? '#312e81' : '#1e1e24',
            border: `1px solid ${selectedId === 'bulk' ? '#6366f1' : '#2a2a2e'}`,
            borderRadius: 8, marginBottom: 12, cursor: 'pointer', fontWeight: 700, color: '#fff', fontSize: 13,
            transition: 'all 0.15s'
          }}
        >
          {selectedId === 'bulk' ? '✓ Bulk Mode Active (Editing All)' : '✨ Select Bulk Mode (Edit All)'}
        </div>
      )}

      {/* Caption list */}
      <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
        {project.captions
          .slice()
          .sort((a, b) => a.start - b.start)
          .map(cap => (
            <div
              key={cap.id}
              onClick={() => selectCaption(cap.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
                background: cap.id === selectedId ? '#22223a' : '#1e1e24',
                border: `1px solid ${cap.id === selectedId ? '#6366f1' : 'transparent'}`,
                borderRadius: 8, marginBottom: 6, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, minWidth: 80, flexShrink: 0 }}>
                {formatTime(cap.start)}–{formatTime(cap.end)}
              </span>
              <input
                value={cap.text}
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  useProjectStore.setState(state => ({
                    project: {
                      ...state.project,
                      captions: state.project.captions.map(c =>
                        c.id === cap.id ? { ...c, text: e.target.value } : c
                      ),
                    },
                  }));
                }}
                style={{ flex: 1, background: 'none', border: 'none', color: '#ddd', fontSize: 13, outline: 'none', minWidth: 0 }}
              />
              <button
                onClick={e => { e.stopPropagation(); removeCaption(cap.id); }}
                style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}
              >
                ×
              </button>
            </div>
          ))}
        {project.captions.length === 0 && (
          <p style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
            Upload a video to auto-generate captions, or add one manually below.
          </p>
        )}
      </div>

      {/* Add caption */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add caption text..."
          style={{ flex: 1, background: '#1e1e24', border: '1px solid #2a2a2e', borderRadius: 8, color: '#fff', padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <button
          onClick={handleAdd}
          style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
        >
          Add
        </button>
      </div>

      {/* Style editor — shows when an individual caption or Bulk mode is active */}
      {selectedCaption && style && (
        <>
          <Divider />
          <SectionTitle>Word highlight</SectionTitle>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
            {words.map((word, i) => {
              const active = (style.highlightWords || []).includes(word);
              return (
                <button
                  key={`${word}-${i}`}
                  onClick={() => {
                    const cur = style.highlightWords || [];
                    set({ highlightWords: active ? cur.filter(w => w !== word) : [...cur, word] });
                  }}
                  style={{
                    background: active ? style.highlightColor || '#39FF14' : '#1e1e24',
                    border: `1px solid ${active ? style.highlightColor || '#39FF14' : '#2a2a2e'}`,
                    color: active ? '#000' : '#ccc',
                    borderRadius: 20, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
                  }}
                >
                  {word}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#aaa' }}>Highlight color</span>
            <input
              type="color"
              value={style.highlightColor || '#39FF14'}
              onChange={e => set({ highlightColor: e.target.value })}
              style={{ width: 26, height: 26 }}
            />
          </div>

          {/* Timing Controls Block — hidden during bulk mode to prevent overlapping collision */}
          {selectedId !== 'bulk' && (
            <>
              <Divider />
              <SectionTitle>Timing Duration</SectionTitle>
              <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>Start Time (seconds)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={selectedCaption.start}
                    onChange={e => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      updateCaptionTiming(selectedCaption.id, { start: Number(val.toFixed(2)) });
                    }}
                    style={{
                      width: '100%', background: '#1e1e24', border: '1px solid #2a2a2e',
                      borderRadius: 6, color: '#fff', padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit'
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 4 }}>End Time (seconds)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={selectedCaption.end}
                    onChange={e => {
                      const val = Math.max(selectedCaption.start, parseFloat(e.target.value) || 0);
                      updateCaptionTiming(selectedCaption.id, { end: Number(val.toFixed(2)) });
                    }}
                    style={{
                      width: '100%', background: '#1e1e24', border: '1px solid #2a2a2e',
                      borderRadius: 6, color: '#fff', padding: '7px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit'
                    }}
                  />
                </div>
              </div>
            </>
          )}

          <Divider />
          <SectionTitle>Text style</SectionTitle>

          {/* Font Selection Dropdown List */}
          <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Font family</p>
          <div style={{ 
            maxHeight: 145, 
            overflowY: 'auto', 
            border: '1px solid #2a2a2e', 
            borderRadius: 8, 
            background: '#141418',
            padding: 4,
            marginBottom: 12 
          }}>
            {FONTS.map(f => {
              const isSelected = style.fontFamily === f;
              return (
                <button
                  key={f}
                  onClick={() => set({ fontFamily: f })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    background: isSelected ? '#22223a' : 'transparent',
                    border: 'none',
                    color: isSelected ? '#6366f1' : '#ccc',
                    borderRadius: 6, 
                    padding: '8px 12px', 
                    cursor: 'pointer', 
                    fontSize: 13,
                    fontFamily: f, 
                    transition: 'all 0.15s', 
                    textAlign: 'left',
                  }}
                >
                  <span>{f}</span>
                  {isSelected && <span style={{ fontSize: 11 }}>●</span>}
                </button>
              );
            })}
          </div>

          <SliderRow label="Font size" min={16} max={96} value={style.fontSize} unit="px" onChange={v => set({ fontSize: v })} />

          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Font weight</p>
            <BadgeGroup
              options={[{ label: 'Regular', value: '400' }, { label: 'Bold', value: '700' }, { label: 'Black', value: '900' }]}
              value={String(style.fontWeight || '700')}
              onChange={v => set({ fontWeight: v })}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Text align</p>
            <BadgeGroup
              options={[{ label: '≡ Left', value: 'left' }, { label: '≡ Center', value: 'center' }, { label: '≡ Right', value: 'right' }]}
              value={style.textAlign || 'center'}
              onChange={v => set({ textAlign: v })}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Text color</p>
            <ColorSwatches colors={TEXT_COLORS} value={style.color} onChange={v => set({ color: v })} />
          </div>

          <Divider />
          <SectionTitle>Background</SectionTitle>

          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>BG color</p>
            <ColorSwatches colors={BG_COLORS} value={bgColor} onChange={v => {
              if (v === 'transparent') {
                set({ backgroundColor: { r: 0, g: 0, b: 0, a: 0 } });
              } else {
                const hex = rgbaToHex(v);
                set({ backgroundColor: hexToRgba(hex.startsWith('#') ? hex : '#000000', bgOpacity / 100) });
              }
            }} showPicker />
          </div>

          <SliderRow label="BG opacity" min={0} max={100} value={bgOpacity} unit="%" onChange={v => {
            set({ backgroundColor: hexToRgba(bgColor, v / 100) });
          }} />

          <SliderRow label="Radius" min={0} max={40} value={style.borderRadius} unit="px" onChange={v => set({ borderRadius: v })} />

          <Divider />
          <SectionTitle>Position</SectionTitle>

          {/* 3x3 position grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, width: 100, marginBottom: 12 }}>
            {POSITIONS.map((p, i) => (
              <button
                key={i}
                onClick={() => set({ position: { x: p.value.x, y: p.value.y } })}
                style={{
                  background: '#1e1e24', border: '1px solid #2a2a2e',
                  color: '#888', borderRadius: 4, padding: '6px', cursor: 'pointer',
                  fontSize: 14, lineHeight: 1, fontFamily: 'inherit',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <SliderRow 
            label="X position" min={0} max={100} 
            value={typeof style.position.x === 'number' ? style.position.x : 50} unit="%" 
            onChange={v => set({ position: { ...style.position, x: Number(v.toFixed(2)) } })} 
          />

          <SliderRow 
            label="Y position" min={0} max={95} 
            value={style.position.y} unit="%" 
            onChange={v => set({ position: { ...style.position, y: Number(v.toFixed(2)) } })} 
          />

          <Divider />
          <SectionTitle>Animation</SectionTitle>
            
          <GridButtons options={ANIMATIONS} value={style.animation} onChange={v => set({ animation: v as CaptionStyle['animation'] })} columns={3} />

          {/* ─── ADDED WORD BY WORD APPEARANCE TOGGLE CONTROLS ─── */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer', fontSize: 13, color: '#ddd' }}>
            <input
              type="checkbox"
              checked={!!style.wordByWord}
              onChange={e => set({ wordByWord: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600 }}>Word by word appearance</span>
          </label>
          {/* ───────────────────────────────────────────────────── */}

          <div style={{ height: 20 }} />
        </>
      )}
    </div>
  );
};