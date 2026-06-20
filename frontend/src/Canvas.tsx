import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useProjectStore } from './store/projectStore';
import type { Caption, StickerOverlay } from './types';
import { interpolate, spring } from 'remotion';
import { getUnifiedAnimationStyles } from './remotion/sharedAnimations';

// The fixed panel layout width allocated for the preview column in your editor dashboard
const PREVIEW_PANEL_WIDTH = 250;

type SelectedEl = { type: 'caption'; id: string } | { type: 'sticker'; id: string } | null;

interface DragState {
  startMouseX: number;
  startMouseY: number;
  startElX: number; // Stored in native composition pixel units
  startElY: number; // Stored in native composition pixel units
  startInitialX?: number;
  startInitialY?: number;
  startFinalX?: number;
  startFinalY?: number;
}

interface ResizeState extends DragState {
  startW: number;
  startH: number;
  handle: 'tl' | 'tr' | 'bl' | 'br';
  startInitialWidth?: number;
  startInitialHeight?: number;
  startFinalWidth?: number;
  startFinalHeight?: number;
}

const resolveCanvasEasing = (easingStr: string | undefined) => {
  switch (easingStr) {
    case 'ease-in':
      return (t: number) => t * t;
    case 'ease-out':
      return (t: number) => t * (2 - t);
    case 'ease-in-out':
      return (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'bounce': {
      return (t: number) => {
        let s = 7.5625;
        let p = 2.75;
        if (t < 1 / p) {
          return s * t * t;
        } else if (t < 2 / p) {
          t -= 1.5 / p;
          return s * t * t + 0.75;
        } else if (t < 2.5 / p) {
          t -= 2.25 / p;
          return s * t * t + 0.9375;
        } else {
          t -= 2.625 / p;
          return s * t * t + 0.984375;
        }
      };
    }
    case 'linear':
    default:
      return (t: number) => t;
  }
};

export const Canvas: React.FC<{
  currentFrame: number;
  isPlaying: boolean;
}> = ({ currentFrame, isPlaying }) => {
  const project = useProjectStore(s => s.project);
  const selectedCaptionId = useProjectStore(s => s.selectedCaptionId);
  const selectCaption = useProjectStore(s => s.selectCaption);
  const updateCaptionStyle = useProjectStore(s => s.updateCaptionStyle);
  const updateSticker = useProjectStore(s => s.updateSticker);

  const [selected, setSelected] = useState<SelectedEl>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Native Dimensions fallback architecture
  const nativeWidth = project?.resolution?.width || 1080;
  const nativeHeight = project?.resolution?.height || 1920;

  // Compute uniform scale vector to translate native resolution down to preview UI bounds
  const scaleFactor = PREVIEW_PANEL_WIDTH / nativeWidth;
  const computedPreviewHeight = nativeHeight * scaleFactor;

  const fps = project.fps || 30;
  const currentTime = currentFrame / fps;

  const visibleCaptions = project.captions.filter(
    c => currentTime >= c.start && currentTime <= c.end
  );
  const visibleStickers = project.overlays.filter(
    o => currentTime >= o.start && currentTime <= o.end
  );
  const activeFilters = project.filters.filter(
    f => currentTime >= f.start && currentTime <= f.end
  );

  const getInterpolatedSticker = useCallback((sticker: StickerOverlay) => {
    const hasMotion = sticker.initialX !== undefined && sticker.finalX !== undefined;
    
    if (!hasMotion) {
      return {
        x: sticker.x,
        y: sticker.y,
        width: sticker.width,
        height: sticker.height,
        rotation: sticker.rotation,
      };
    }

    const stickerDurationInFrames = Math.max(1, Math.round((sticker.end - sticker.start) * fps));
    const currentStickerFrame = Math.max(0, Math.min(stickerDurationInFrames - 1, Math.round((currentTime - sticker.start) * fps)));
    const t = currentStickerFrame / (stickerDurationInFrames - 1 || 1);
    
    const easing = resolveCanvasEasing(sticker.motionEasing);
    const easedT = easing(t);

    const startX = sticker.initialX ?? sticker.x;
    const startY = sticker.initialY ?? sticker.y;
    const startWidth = sticker.initialWidth ?? sticker.width;
    const startHeight = sticker.initialHeight ?? sticker.height;
    const startRotation = sticker.initialRotation ?? sticker.rotation;

    const endX = sticker.finalX ?? startX;
    const endY = sticker.finalY ?? startY;
    const endWidth = sticker.finalWidth ?? startWidth;
    const endHeight = sticker.finalHeight ?? startHeight;
    const endRotation = sticker.finalRotation ?? startRotation;

    return {
      x: startX + (endX - startX) * easedT,
      y: startY + (endY - startY) * easedT,
      width: startWidth + (endWidth - startWidth) * easedT,
      height: startHeight + (endHeight - startHeight) * easedT,
      rotation: startRotation + (endRotation - startRotation) * easedT,
    };
  }, [fps, currentTime]);

  let videoFilterStr = '';
  let hasGrayscale = false;
  let hasSepia = false;
  let hasVintage = false;
  let brightnessVal = 100;
  let contrastVal = 100;
  let saturateVal = 100;

  activeFilters.forEach(f => {
    if (f.type === 'grayscale') hasGrayscale = true;
    if (f.type === 'sepia') hasSepia = true;
    if (f.type === 'vintage') hasVintage = true;
    if (f.type === 'brightness' || f.id?.includes('brightness')) brightnessVal = f.intensity > 2 ? f.intensity : f.intensity * 100;
    if (f.type === 'contrast' || f.id?.includes('contrast')) contrastVal = f.intensity > 2 ? f.intensity : f.intensity * 100;
    if (f.type === 'saturate' || f.type === 'saturation' || f.id?.includes('saturate')) saturateVal = f.intensity > 2 ? f.intensity : f.intensity * 100;
  });

  if (hasGrayscale) videoFilterStr += 'grayscale(1) ';
  if (hasSepia) videoFilterStr += 'sepia(1) ';
  if (hasVintage) videoFilterStr += 'sepia(0.5) contrast(1.2) brightness(0.9) ';
  videoFilterStr += `brightness(${brightnessVal}%) contrast(${contrastVal}%) saturate(${saturateVal}%)`;

  const activeVignette = activeFilters.some(f => f.type === 'vignette' || f.id === 'overlay-vignette');
  const activeLightLeak = activeFilters.some(f => f.type === 'light-leak' || f.id === 'overlay-light-leak');
  const activeFilmGrain = activeFilters.some(f => f.type === 'film-grain' || f.id === 'overlay-film-grain');
  const activeCoolTone = activeFilters.some(f => f.type === 'cool-tone' || f.id === 'overlay-cool-tone');

  useEffect(() => {
    if (selectedCaptionId) {
      setSelected({ type: 'caption', id: selectedCaptionId });
    } else if (selected?.type === 'caption') {
      setSelected(null);
    }
  }, [selectedCaptionId]);

  useEffect(() => {
    if (isPlaying) {
      setSelected(null);
      selectCaption(null);
    }
  }, [isPlaying, selectCaption]);

  // Resolves coordinates completely into High-Resolution Native Space
  function captionNativePos(cap: Caption): { left: number; top: number } {
    const style = cap.style;
    const top = (style.position.y / 100) * nativeHeight;
    let left = nativeWidth / 2;
    if (typeof style.position.x === 'number') {
      left = (style.position.x / 100) * nativeWidth;
    } else if (style.position.x === 'left') {
      left = 80;
    } else if (style.position.x === 'right') {
      left = nativeWidth - 80;
    }
    return { left, top };
  }

  function nativeToStorePercentage(nativeLeft: number, nativeTop: number) {
    return {
      x: Math.round(((nativeLeft / nativeWidth) * 100) * 100) / 100,
      y: Math.round(((nativeTop / nativeHeight) * 100) * 100) / 100,
    };
  }

  const onCaptionMouseDown = (e: React.MouseEvent, cap: Caption) => {
    e.stopPropagation();
    const idToUse = selectedCaptionId === 'bulk' ? 'bulk' : cap.id;
    setSelected({ type: 'caption', id: idToUse });
    if (selectedCaptionId !== 'bulk') selectCaption(cap.id);
    
    const pos = captionNativePos(cap);
    setDragState({
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startElX: pos.left,
      startElY: pos.top,
    });
  };

  const onStickerMouseDown = (e: React.MouseEvent, sticker: StickerOverlay) => {
    e.stopPropagation();
    setSelected({ type: 'sticker', id: sticker.id });
    selectCaption(null);
    
    const interpolated = getInterpolatedSticker(sticker);
    setDragState({
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startElX: interpolated.x,
      startElY: interpolated.y,
      startInitialX: sticker.initialX,
      startInitialY: sticker.initialY,
      startFinalX: sticker.finalX,
      startFinalY: sticker.finalY,
    });
  };

  const onResizeMouseDown = (
    e: React.MouseEvent,
    el: any,
    elType: 'caption' | 'sticker',
    handle: ResizeState['handle']
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (elType === 'sticker') {
      const interpolated = getInterpolatedSticker(el);
      setResizeState({
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startElX: interpolated.x,
        startElY: interpolated.y,
        startW: interpolated.width,
        startH: interpolated.height,
        handle,
        startInitialX: el.initialX,
        startInitialY: el.initialY,
        startFinalX: el.finalX,
        startFinalY: el.finalY,
        startInitialWidth: el.initialWidth,
        startInitialHeight: el.initialHeight,
        startFinalWidth: el.finalWidth,
        startFinalHeight: el.finalHeight,
      });
    } else if (elType === 'caption') {
      const pos = captionNativePos(el);
      const currentWidth = el.style.width ? el.style.width : 600;
      setResizeState({
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startElX: pos.left,
        startElY: pos.top,
        startW: currentWidth,
        startH: 0,
        handle,
      });
    }
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!selected) return;

    if (dragState && !resizeState) {
      const dx = (e.clientX - dragState.startMouseX) / scaleFactor;
      const dy = (e.clientY - dragState.startMouseY) / scaleFactor;
      
      const newLeft = Math.max(0, Math.min(nativeWidth, dragState.startElX + dx));
      const newTop = Math.max(0, Math.min(nativeHeight, dragState.startElY + dy));

      if (selected.type === 'caption') {
        const pos = nativeToStorePercentage(newLeft, newTop);
        if (selected.id === 'bulk') {
          project.captions.forEach(c => updateCaptionStyle(c.id, { position: pos }));
        } else {
          updateCaptionStyle(selected.id, { position: pos });
        }
      } else if (selected.type === 'sticker') {
        const currentSticker = project.overlays.find(o => o.id === selected.id) as StickerOverlay | undefined;
        if (currentSticker) {
          const hasMotion = dragState.startInitialX !== undefined && dragState.startFinalX !== undefined;
          
          if (hasMotion) {
            const dxProject = Math.round(dx);
            const dyProject = Math.round(dy);

            updateSticker(selected.id, {
              x: Math.round(newLeft),
              y: Math.round(newTop),
              initialX: (dragState.startInitialX ?? currentSticker.x) + dxProject,
              initialY: (dragState.startInitialY ?? currentSticker.y) + dyProject,
              finalX: (dragState.startFinalX ?? currentSticker.x) + dxProject,
              finalY: (dragState.startFinalY ?? currentSticker.y) + dyProject,
            });
          } else {
            updateSticker(selected.id, {
              x: Math.round(newLeft),
              y: Math.round(newTop),
            });
          }
        }
      }
    }

    if (resizeState) {
      const dx = (e.clientX - resizeState.startMouseX) / scaleFactor;
      const dy = (e.clientY - resizeState.startMouseY) / scaleFactor;

      if (selected.type === 'sticker') {
        const delta = resizeState.handle === 'br' || resizeState.handle === 'tr' ? dx : -dx;
        const targetWidth = Math.max(50, resizeState.startW + delta);
        const targetHeight = Math.max(50, resizeState.startH + delta);

        const hasSizeMotion = resizeState.startInitialWidth !== undefined && resizeState.startFinalWidth !== undefined;
        if (hasSizeMotion) {
          const dw = targetWidth - resizeState.startW;
          const dh = targetHeight - resizeState.startH;
          updateSticker(selected.id, {
            initialWidth: Math.max(50, (resizeState.startInitialWidth ?? 0) + dw),
            initialHeight: Math.max(50, (resizeState.startInitialHeight ?? 0) + dh),
            finalWidth: Math.max(50, (resizeState.startFinalWidth ?? 0) + dh),
            finalHeight: Math.max(50, (resizeState.startFinalHeight ?? 0) + dh),
          });
        } else {
          updateSticker(selected.id, {
            width: Math.round(targetWidth),
            height: Math.round(targetHeight),
          });
        }
      } else if (selected.type === 'caption') {
        const deltaX = (resizeState.handle === 'tr' || resizeState.handle === 'br') ? dx : -dx;
        const currentCaption = project.captions.find(c => c.id === selected.id);
        
        const isCentered = !currentCaption || currentCaption.style.position.x === 'center' || currentCaption.style.position.x === 50;
        const multiplier = isCentered ? 2 : 1;

        const finalRenderWidth = Math.max(200, Math.min(nativeWidth - 40, resizeState.startW + (deltaX * multiplier)));

        if (selected.id === 'bulk') {
          project.captions.forEach(c => updateCaptionStyle(c.id, { width: Math.round(finalRenderWidth) } as any));
        } else {
          updateCaptionStyle(selected.id, { width: Math.round(finalRenderWidth) } as any);
        }
      }
    }
  }, [dragState, resizeState, selected, scaleFactor, nativeWidth, nativeHeight, project.captions, project.overlays, updateCaptionStyle, updateSticker]);

  const onMouseUp = useCallback(() => {
    setDragState(null);
    setResizeState(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const isSelectedCaption = (id: string) =>
    selected?.type === 'caption' && (selected.id === id || selected.id === 'bulk');
  const isSelectedSticker = (id: string) =>
    selected?.type === 'sticker' && selected.id === id;

  return (
    <div
      ref={canvasRef}
      onMouseDown={(e) => {
        if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'VIDEO') {
          setSelected(null);
          selectCaption(null);
        }
      }}
      style={{
        position: 'relative', 
        width: PREVIEW_PANEL_WIDTH, 
        height: computedPreviewHeight, 
        background: '#000',
        borderRadius: 14, 
        overflow: 'hidden', 
        border: '1px solid #2a2a2e', 
        flexShrink: 0,
        cursor: 'default', 
        userSelect: 'none',
      }}
    >
      <div 
        style={{ 
          width: nativeWidth, 
          height: nativeHeight, 
          position: 'absolute', 
          top: 0, 
          left: 0,
          transform: `scale(${scaleFactor})`,
          transformOrigin: 'top left',
        }}
      >
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, filter: videoFilterStr }}>
          {project.videoSrc ? (
            <video
              src={project.videoSrc}
              style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
              loop
              ref={el => {
                if (!el) return;
                const targetTime = currentFrame / fps;
                if (Math.abs(el.currentTime - targetTime) > 0.2) el.currentTime = targetTime;
                if (isPlaying) {
                  if (Math.abs(el.currentTime - targetTime) > 1.0) {
                    el.currentTime = targetTime;
                  }
                  if (el.paused) el.play().catch(() => {});
                } else {
                  el.pause();
                  if (Math.abs(el.currentTime - targetTime) > 0.03) {
                    el.currentTime = targetTime;
                  }
                }
              }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
              <span style={{ fontSize: 120, opacity: 0.2 }}>▶</span>
              <span style={{ color: '#444', fontSize: 32 }}>Upload a video to start</span>
            </div>
          )}
        </div>

        {activeVignette && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(ellipse, transparent 50%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none', zIndex: 1 }} />}
        {activeLightLeak && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(45deg,rgba(255,200,100,0.3),transparent)', pointerEvents: 'none', zIndex: 1 }} />}
        {activeFilmGrain && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.02) 0px,rgba(0,0,0,0.02) 1px)', pointerEvents: 'none', zIndex: 1 }} />}
        {activeCoolTone && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(135deg,rgba(0,150,255,0.2),transparent)', pointerEvents: 'none', zIndex: 1 }} />}

        {/* Stickers Loop */}
        {visibleStickers.map(sticker => {
          const interpolated = getInterpolatedSticker(sticker);
          const isSel = isSelectedSticker(sticker.id);

          const relativeFrame = Math.max(0, currentFrame - Math.round(sticker.start * fps));
          const inDuration = 8;
          let stickerOpacity = 1;
          let baseTransform = `rotate(${interpolated.rotation || 0}deg)`;

          const anim = (sticker as any).animation || 'none';
          if (anim === 'fade') stickerOpacity = Math.min(1, relativeFrame / inDuration);
          else if (anim === 'pop') {
            const progress = Math.min(1, relativeFrame / inDuration);
            baseTransform += ` scale(${relativeFrame >= inDuration ? 1 : 0.6 + 0.4 * progress})`;
          } else if (anim === 'slide-up') {
            const progress = Math.min(1, relativeFrame / inDuration);
            stickerOpacity = progress;
            baseTransform += ` translateY(${relativeFrame >= inDuration ? 0 : 20 * (1 - progress)}px)`;
          } else if (anim === 'bounce') {
            const progress = Math.min(1, relativeFrame / inDuration);
            baseTransform += ` translateY(${relativeFrame >= inDuration ? 0 : Math.sin(progress * Math.PI) * -15}px)`;
          } else if (anim === 'zoom') {
            const progress = Math.min(1, relativeFrame / inDuration);
            stickerOpacity = progress;
            baseTransform += ` scale(${relativeFrame >= inDuration ? 1 : 0.2 + 0.8 * progress})`;
          } else if (anim === 'shake' && relativeFrame < inDuration) {
            baseTransform += ` translateX(${Math.sin(relativeFrame * 2) * 5}px)`;
          }

          return (
            <div
              key={sticker.id}
              onMouseDown={e => onStickerMouseDown(e, sticker)}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', 
                left: interpolated.x, 
                top: interpolated.y, 
                width: interpolated.width, 
                height: interpolated.height,
                cursor: 'move', 
                transform: baseTransform, 
                opacity: stickerOpacity,
                transformOrigin: 'center center', 
                outline: isSel ? `${4 / scaleFactor}px solid #6366f1` : 'none',
                boxSizing: 'border-box', 
                zIndex: 5,
              }}
            >
              <img src={sticker.assetUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} alt="" />
              {isSel && (
                <>
                  <SelectionHandles scaleFactor={scaleFactor} onResize={(e, handle) => onResizeMouseDown(e, sticker, 'sticker', handle)} />
                  <DeleteBtn scaleFactor={scaleFactor} onClick={() => { useProjectStore.getState().removeSticker(sticker.id); setSelected(null); }} />
                </>
              )}
            </div>
          );
        })}

        {/* Captions Loop */}
        {visibleCaptions.map(cap => {
          const { left, top } = captionNativePos(cap);
          const style = cap.style;
          const isSel = isSelectedCaption(cap.id);
          const bg = style.backgroundColor;
          const bgCss = typeof bg === 'string' ? bg : `rgba(${bg.r},${bg.g},${bg.b},${bg.a})`;

          const baseTransform = 'translate(-50%, -50%)';
          const relativeFrame = Math.max(0, currentFrame - Math.round(cap.start * fps));
          const inDuration = 8;
          
          let animOpacity = 1;
          let animTransform = '';
          let visibleText = cap.text;

          const currentAnimType = style.animation || 'none';

          if (!(style as any).wordByWord) {
            if (currentAnimType === 'fade') animOpacity = Math.min(1, relativeFrame / inDuration);
            else if (currentAnimType === 'pop') {
              const progress = Math.min(1, relativeFrame / inDuration);
              animTransform = `scale(${relativeFrame >= inDuration ? 1 : 0.6 + 0.4 * progress})`;
            } else if (currentAnimType === 'slide-up') {
              const progress = Math.min(1, relativeFrame / inDuration);
              animOpacity = progress;
              animTransform = `translateY(${relativeFrame >= inDuration ? 0 : 20 * (1 - progress)}px)`;
            } else if (currentAnimType === 'bounce') {
              const progress = Math.min(1, relativeFrame / inDuration);
              animTransform = `translateY(${relativeFrame >= inDuration ? 0 : Math.sin(progress * Math.PI) * -15}px)`;
            } else if (currentAnimType === 'zoom') {
              const progress = Math.min(1, relativeFrame / inDuration);
              animOpacity = progress;
              animTransform = `scale(${relativeFrame >= inDuration ? 1 : 0.2 + 0.8 * progress})`;
            } else if (currentAnimType === 'shake' && relativeFrame < inDuration) {
              animTransform = `translateX(${Math.sin(relativeFrame * 2) * 5}px)`;
            } else if (currentAnimType === 'typewriter') {
              visibleText = cap.text.slice(0, Math.floor(relativeFrame * 1.5));
            }
          }

          const customWidth = (style as any).width ? `${(style as any).width}px` : '85%';

          return (
            <div
              key={cap.id}
              onMouseDown={e => onCaptionMouseDown(e, cap)}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', 
                left, 
                top,
                transform: animTransform ? `${baseTransform} ${animTransform}` : baseTransform,
                opacity: animOpacity, 
                cursor: 'move',
                width: customWidth, 
                maxWidth: '95%',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '16px 40px', 
                borderRadius: style.borderRadius || 8,
                background: bgCss, 
                color: style.color, 
                fontFamily: style.fontFamily || 'inherit',
                fontSize: style.fontSize || 48, 
                fontWeight: (style as any).fontWeight || 700,
                lineHeight: 1.35, 
                textAlign: ((style as any).textAlign as any) || 'center',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                outline: isSel ? `${4 / scaleFactor}px solid #6366f1` : 'none', 
                outlineOffset: 4,
                boxSizing: 'border-box', 
                zIndex: 10,
              }}
            >
              {isSel ? (
                <textarea
                  value={cap.text}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
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
                  style={{
                    background: 'transparent', 
                    border: 'none', 
                    outline: 'none',
                    color: style.color, 
                    fontFamily: style.fontFamily || 'inherit',
                    fontSize: style.fontSize || 48, 
                    fontWeight: (style as any).fontWeight || 700,
                    textAlign: ((style as any).textAlign as any) || 'center',
                    width: '100%', 
                    resize: 'none', 
                    overflow: 'hidden', 
                    padding: 0, 
                    margin: 0,
                    lineHeight: 1.35, 
                    whiteSpace: (style as any).width ? 'normal' : 'nowrap',
                    wordBreak: 'keep-all',
                  }}
                  rows={1}
                  ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                />
              ) : (
                <div style={{ width: '100%' }}>
                  {(style as any).wordByWord ? (
                    <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: (style as any).textAlign || 'center', width: '100%' }}>
                      {(cap.words && cap.words.length > 0 ? cap.words : cap.text.split(/\s+/).filter(Boolean).map((w, i, arr) => ({ text: w, start: cap.start + (i * ((cap.end - cap.start) / arr.length)), end: cap.start + ((i + 1) * ((cap.end - cap.start) / arr.length)) }))).map((w, i) => {
                        const wordStartFrame = Math.round(w.start * fps);
                        const wordDeltaFrames = currentFrame - wordStartFrame;
                        const targetWordStyles = getUnifiedAnimationStyles(currentAnimType, wordDeltaFrames, fps);

                        return (
                          <span 
                            key={i} 
                            style={{ 
                              marginRight: '0.25em',
                              display: 'inline-block',
                              opacity: targetWordStyles.opacity,
                              transform: targetWordStyles.transform,
                              transformOrigin: 'center center',
                              color: style.color
                            }}
                          >
                            {w.text}
                          </span>
                        );
                      })}
                    </div>
                  ) : style.animation === 'karaoke' && cap.words ? (
                    cap.words.map((w, i) => {
                      const active = currentTime >= w.start && currentTime <= w.end;
                      return (
                        <span key={i} style={{ color: active || (style.highlightWords || []).includes(w.text) ? style.highlightColor || style.color : style.color, marginRight: '0.25em' }}>
                          {w.text}
                        </span>
                      );
                    })
                  ) : (
                    (() => {
                      const words = (style.animation === 'typewriter' ? visibleText : cap.text).split(/\s+/);
                      const highlighted = style.highlightWords || [];
                      return words.map((w, i) => {
                        const isHighlighted = highlighted.includes(w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,""));
                        return (
                          <span key={i} style={{ color: isHighlighted ? style.highlightColor || '#ef4444' : style.color, marginRight: '0.25em' }}>
                            {w}
                          </span>
                        );
                      });
                    })()
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SelectionHandles: React.FC<{ scaleFactor: number; onResize: (e: React.MouseEvent, handle: ResizeState['handle']) => void }> = ({ scaleFactor, onResize }) => {
  const size = 8 / scaleFactor; const bsz = 2 / scaleFactor; const off = -size / 2;
  const dot = (pos: React.CSSProperties, h: ResizeState['handle'], c: string) => (
    <div onMouseDown={e => onResize(e, h)} style={{ position: 'absolute', width: size, height: size, background: '#6366f1', border: `${bsz}px solid #fff`, borderRadius: '50%', cursor: c, zIndex: 99, ...pos }} />
  );
  return (
    <>
      {dot({ top: off, left: off }, 'tl', 'nwse-resize')}
      {dot({ top: off, right: off }, 'tr', 'nesw-resize')}
      {dot({ bottom: off, left: off }, 'bl', 'nesw-resize')}
      {dot({ bottom: off, right: off }, 'br', 'nwse-resize')}
    </>
  );
};

const DeleteBtn: React.FC<{ scaleFactor: number; onClick: () => void }> = ({ scaleFactor, onClick }) => {
  const size = 18 / scaleFactor;
  return (
    <div 
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{ position: 'absolute', top: -size, right: -size, width: size, height: size, background: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.6, cursor: 'pointer', zIndex: 100, fontWeight: 'bold' }}
    >
      ×
    </div>
  );
};