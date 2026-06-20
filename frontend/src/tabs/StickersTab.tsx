import React, { useRef, useState, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getUploadSignature, uploadToCloudinary } from '../api';
import { SectionTitle, Divider, SliderRow, GridButtons } from './ui';

// ── TYPES & INTERFACES ──────────────────────────────────────────────────────

interface StickerOverlay {
  id: string;
  type: 'sticker';
  assetUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  start: number;
  end: number;
  animation?: 'none' | 'fade' | 'pop' | 'slide-up' | 'bounce' | 'zoom' | 'shake';
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;
  initialRotation?: number;
  finalX?: number;
  finalY?: number;
  finalWidth?: number;
  finalHeight?: number;
  finalRotation?: number;
  motionEasing?: string;
}

const EMOJI_ROWS = [
  ['🔥', '⭐', '❤️', '👍', '➡️', '💯'],
  ['🎉', '🚀', '💬', '📍', '🎵', '✨'],
  ['😂', '🤩', '😍', '🙌', '💪', '👀'],
  ['🌟', '⚡', '🎯', '💥', '🏆', '🎬'],
];

const STICKER_ANIMATIONS = ['none', 'fade', 'pop', 'slide-up', 'bounce', 'zoom', 'shake'];
const MOTION_EASINGS     = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'bounce'];

function emojiToTwemojiUrl(emoji: string): string {
  const cp = [...emoji]
    .map(c => c.codePointAt(0)!.toString(16))
    .filter(c => c !== 'fe0f')
    .join('-');
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`;
}

// ── SUB-COMPONENTS ──────────────────────────────────────────────────────────

const StateBadge: React.FC<{ set: boolean; label: string; x?: number; y?: number }> = ({ set, label, x, y }) => {
  return (
    <span style={{
      fontSize: 10,
      color: set ? '#a5b4fc' : '#555',
      background: set ? '#1e1e3a' : '#1a1a1a',
      border: `1px solid ${set ? '#4f46e5' : '#333'}`,
      borderRadius: 4,
      padding: '2px 6px',
      display: 'block',
      textAlign: 'center',
      marginTop: 3,
      letterSpacing: '0.02em',
    }}>
      {set && x !== undefined && y !== undefined
        ? `${label}: ${Math.round(x)}, ${Math.round(y)}`
        : set ? `${label} Saved` : 'not set'}
    </span>
  );
};

interface SnapButtonProps {
  isSet: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const SnapButton: React.FC<SnapButtonProps> = ({ isSet, onClick, children }) => {
  const [justSnapped, setJustSnapped] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleClick = () => {
    onClick();
    setJustSnapped(true);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setJustSnapped(false);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const background = justSnapped
    ? '#4f46e5' 
    : isSet
    ? '#1e2a3a' 
    : '#252530'; 

  const border = justSnapped
    ? '1px solid #818cf8'
    : isSet
    ? '1px solid #4f46e5'
    : '1px solid #333';

  return (
    <button
      onClick={handleClick}
      style={{
        width: '100%',
        background,
        border,
        color: '#fff',
        borderRadius: 6,
        padding: '7px 4px',
        fontSize: 11,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: justSnapped ? 'scale(0.96)' : 'scale(1)',
        boxShadow: justSnapped ? '0 0 12px rgba(99, 102, 241, 0.6)' : 'none',
      }}
    >
      {children}
    </button>
  );
};

// ── MAIN TAB COMPONENT ──────────────────────────────────────────────────────

export const StickersTab: React.FC = () => {
  const project       = useProjectStore(s => s.project);
  const addSticker    = useProjectStore(s => s.addSticker);
  const removeSticker = useProjectStore(s => s.removeSticker);
  const updateSticker = useProjectStore(s => s.updateSticker);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const duration = project.durationFrames / (project.fps || 30);
  const W = project.resolution.width  || 1080;
  const H = project.resolution.height || 1920;

  // Explicit type-filtering to safely extract only sticker assets from generic project overlays
  const stickerOverlays = (project.overlays || []).filter(
    (o: any): o is StickerOverlay => o.type === 'sticker'
  );

  const addStickerAsset = (assetUrl: string) => {
    const size  = Math.round(W * 0.2);
    const cx    = Math.round((W - size) / 2);
    const cy    = Math.round(H * 0.3);
    const newId = `sticker-${Date.now()}`;
    addSticker({
      id: newId,
      type: 'sticker',
      assetUrl,
      x: cx, 
      y: cy,
      width: size, 
      height: size,
      rotation: 0,
      start: 0,
      end: duration || 30,
      animation: 'pop',
    });
    setExpandedId(newId);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const sig = await getUploadSignature();
      const url = await uploadToCloudinary(file, sig, 'image');
      addStickerAsset(url);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    }
    e.target.value = '';
  };

  return (
    <div>
      <SectionTitle>Emoji stickers</SectionTitle>
      <p style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
        Click to add · Drag on canvas to reposition
      </p>

      {EMOJI_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginBottom: 6 }}>
          {row.map((emoji, ei) => (
            <button
              key={ei}
              onClick={() => addStickerAsset(emojiToTwemojiUrl(emoji))}
              title={`Add ${emoji}`}
              style={{
                background: '#1e1e24', border: '1px solid #2a2a2e', borderRadius: 8,
                padding: '8px 4px', cursor: 'pointer', fontSize: 22, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#6366f1';
                (e.currentTarget as HTMLElement).style.background  = '#22223a';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2e';
                (e.currentTarget as HTMLElement).style.background  = '#1e1e24';
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ))}

      <Divider />
      <SectionTitle>Upload custom</SectionTitle>
      <button
        onClick={() => fileRef.current?.click()}
        style={{
          width: '100%', background: '#1e1e24', border: '1px dashed #3a3a42',
          color: '#888', borderRadius: 8, padding: 14, cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit', marginBottom: 16,
        }}
      >
        ↑ Upload image / PNG / SVG
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />

      {stickerOverlays.length > 0 && (
        <>
          <Divider />
          <SectionTitle>On canvas ({stickerOverlays.length})</SectionTitle>

          {stickerOverlays.map(o => {
            const hasMotion =
              o.initialX !== undefined && o.finalX !== undefined &&
              (o.initialX !== o.finalX || o.initialY !== o.finalY || 
               o.initialWidth !== o.finalWidth || o.initialRotation !== o.finalRotation);

            return (
              <div
                key={o.id}
                style={{
                  background: '#1e1e24', borderRadius: 8, marginBottom: 8,
                  border: expandedId === o.id ? '1px solid #6366f1' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* ── Header ── */}
                <div
                  onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, cursor: 'pointer' }}
                >
                  <img src={o.assetUrl} width={24} height={24} alt="" style={{ borderRadius: 4 }} />
                  <span style={{ flex: 1, fontSize: 13, color: '#ddd' }}>
                    Sticker {o.id.slice(-4)}
                    {hasMotion && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: '#6366f1' }}>● transform motion</span>
                    )}
                  </span>
                  <span style={{ color: '#666' }}>{expandedId === o.id ? '▲' : '▼'}</span>
                </div>

                {/* ── Accordion Body ── */}
                {expandedId === o.id && (
                  <div style={{ padding: '0 10px 10px 10px' }}>

                    {/* ── Motion state settings ── */}
                    <p style={{ fontSize: 11, color: '#888', margin: '8px 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      State Keyframing
                    </p>
                    <p style={{ fontSize: 11, color: '#555', marginBottom: 8, lineHeight: 1.5 }}>
                      Adjust position, size, and rotation on canvas for the <strong style={{ color: '#aaa' }}>start</strong>, 
                      then click <em>Snap Initial</em>. Do the same for your keyframe destination and click <em>Snap Final</em>.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      {/* Initial state snapshot setup */}
                      <div>
                        <SnapButton
                          isSet={o.initialX !== undefined}
                          onClick={() =>
                            updateSticker(o.id, { 
                              initialX: o.x, 
                              initialY: o.y,
                              initialWidth: o.width,
                              initialHeight: o.height,
                              initialRotation: o.rotation
                            })
                          }
                        >
                          📍 Snap Initial State
                        </SnapButton>
                        <StateBadge set={o.initialX !== undefined} label="Initial" x={o.initialX} y={o.initialY} />
                      </div>

                      {/* Final state snapshot setup */}
                      <div>
                        <SnapButton
                          isSet={o.finalX !== undefined}
                          onClick={() =>
                            updateSticker(o.id, { 
                              finalX: o.x, 
                              finalY: o.y,
                              finalWidth: o.width,
                              finalHeight: o.height,
                              finalRotation: o.rotation
                            })
                          }
                        >
                          🏁 Snap Final State
                        </SnapButton>
                        <StateBadge set={o.finalX !== undefined} label="Final" x={o.finalX} y={o.finalY} />
                      </div>
                    </div>

                    {/* Clear State Animation configuration override */}
                    {o.initialX !== undefined && o.finalX !== undefined && (
                      <button
                        onClick={() =>
                          updateSticker(o.id, {
                            initialX: undefined, initialY: undefined,
                            initialWidth: undefined, initialHeight: undefined,
                            initialRotation: undefined,
                            finalX: undefined,   finalY: undefined,
                            finalWidth: undefined, finalHeight: undefined,
                            finalRotation: undefined,
                          })
                        }
                        style={{
                          marginTop: 6, width: '100%', background: 'transparent',
                          border: '1px solid #333', color: '#666', borderRadius: 6,
                          padding: '4px', fontSize: 10, cursor: 'pointer',
                        }}
                      >
                        ✕ Reset state animation
                      </button>
                    )}

                    {hasMotion && (
                      <>
                        <p style={{ fontSize: 11, color: '#666', marginTop: 10, marginBottom: 6 }}>
                          Motion easing curve
                        </p>
                        <GridButtons
                          options={MOTION_EASINGS}
                          value={o.motionEasing || 'linear'}
                          onChange={v => updateSticker(o.id, { motionEasing: v })}
                          columns={3}
                        />
                      </>
                    )}

                    <Divider />

                    {/* ── Dynamic Layout fallbacks if states aren't applied ── */}
                    <SliderRow label="Size"   min={40} max={Math.min(W, H)} value={o.width}    unit="px" onChange={v => updateSticker(o.id, { width: v, height: v })} />
                    <SliderRow label="Rotate" min={-180} max={180}          value={o.rotation} unit="°"  onChange={v => updateSticker(o.id, { rotation: v })} />

                    {/* ── Timing Configurations ── */}
                    <SliderRow label="Start" min={0} max={duration} step={0.1} value={o.start} unit="s" onChange={v => updateSticker(o.id, { start: v })} />
                    <SliderRow label="End"   min={0} max={duration} step={0.1} value={o.end}   unit="s" onChange={v => updateSticker(o.id, { end: v })} />

                    {/* ── Entrance Animation Overlays ── */}
                    <p style={{ fontSize: 11, color: '#666', marginTop: 10, marginBottom: 6 }}>
                      Entrance animation
                    </p>
                    <GridButtons
                      options={STICKER_ANIMATIONS}
                      value={o.animation || 'none'}
                      onChange={v => updateSticker(o.id, { animation: v as any })}
                      columns={3}
                    />

                    {/* ── Delete Action trigger ── */}
                    <button
                      onClick={() => removeSticker(o.id)}
                      style={{
                        marginTop: 12, width: '100%', background: '#351616',
                        color: '#ff4444', border: 'none', borderRadius: 6,
                        padding: '6px', fontSize: 12, cursor: 'pointer',
                      }}
                    >
                      Delete Sticker
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};