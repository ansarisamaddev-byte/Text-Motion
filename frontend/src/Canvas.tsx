import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useProjectStore } from './store/projectStore';
import type { Caption, StickerOverlay } from './types';
import { interpolate, spring } from 'remotion';
import { getUnifiedAnimationStyles } from './remotion/sharedAnimations';

type SelectedEl = { type: 'caption'; id: string } | { type: 'sticker'; id: string } | null;

interface DragState {
  startMouseX: number;
  startMouseY: number;
  startElX: number;
  startElY: number;
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

interface VideoPanState {
  startMouseX: number;
  startMouseY: number;
  startVideoX: number;
  startVideoY: number;
}

const resolveCanvasEasing = (easingStr: string | undefined) => {
  switch (easingStr) {
    case 'ease-in': return (t: number) => t * t;
    case 'ease-out': return (t: number) => t * (2 - t);
    case 'ease-in-out': return (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'bounce': {
      return (t: number) => {
        let s = 7.5625; let p = 2.75;
        if (t < 1 / p) return s * t * t;
        else if (t < 2 / p) { t -= 1.5 / p; return s * t * t + 0.75; }
        else if (t < 2 / p) { t -= 2.25 / p; return s * t * t + 0.9375; }
        else { t -= 2.625 / p; return s * t * t + 0.984375; }
      };
    }
    case 'linear':
    default: return (t: number) => t;
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

  // Fallbacks to store global orientation state matrices safely
  const videoX = project.videoX ?? 0;
  const videoY = project.videoY ?? 0;
  const contentZoom = project.contentZoom ?? 1.0;
  const flipHorizontal = project.flipHorizontal ?? false;
  const flipVertical = project.flipVertical ?? false;

  const setProjectState = (updates: Partial<typeof project>) => {
    useProjectStore.setState(state => ({
      project: { ...state.project, ...updates }
    }));
  };

  const [selected, setSelected] = useState<SelectedEl>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [videoPanState, setVideoPanState] = useState<VideoPanState | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [videoVolume, setVideoVolume] = useState(1.0);

  const nativeWidth = project?.resolution?.width || 1080;
  const nativeHeight = project?.resolution?.height || 1920;

  const PARENT_CONTAINER_WIDTH = 500; 
  const PARENT_CONTAINER_HEIGHT = 400; 

  const aspectRatio = nativeWidth / nativeHeight;
  let displayWidth: number, displayHeight: number;

  if (nativeWidth > nativeHeight) {
    displayWidth = Math.min(PARENT_CONTAINER_WIDTH, PARENT_CONTAINER_HEIGHT * aspectRatio);
    displayHeight = displayWidth / aspectRatio;
  } else {
    displayHeight = Math.min(PARENT_CONTAINER_HEIGHT, PARENT_CONTAINER_WIDTH / aspectRatio);
    displayWidth = displayHeight * aspectRatio;
  }

  const baseScaleFactor = displayWidth / nativeWidth;
  const scaleFactor = baseScaleFactor * contentZoom;

  const fps = project.fps || 30;
  const currentTime = currentFrame / fps;

  const visibleCaptions = project.captions.filter(c => currentTime >= c.start && currentTime <= c.end);
  const visibleStickers = project.overlays.filter(o => currentTime >= o.start && currentTime <= o.end);
  const activeFilters = project.filters.filter(f => currentTime >= f.start && currentTime <= f.end);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const getInterpolatedSticker = useCallback((sticker: StickerOverlay) => {
    const hasMotion = sticker.initialX !== undefined && sticker.finalX !== undefined;
    if (!hasMotion) {
      return { x: sticker.x, y: sticker.y, width: sticker.width, height: sticker.height, rotation: sticker.rotation };
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

    return {
      x: startX + ((sticker.finalX ?? startX) - startX) * easedT,
      y: startY + ((sticker.finalY ?? startY) - startY) * easedT,
      width: startWidth + ((sticker.finalWidth ?? startWidth) - startWidth) * easedT,
      height: startHeight + ((sticker.finalHeight ?? startHeight) - startHeight) * easedT,
      rotation: startRotation + ((sticker.finalRotation ?? startRotation) - startRotation) * easedT,
    };
  }, [fps, currentTime]);

  let videoFilterStr = '';
  let hasGrayscale = false, hasSepia = false, hasVintage = false;
  let brightnessVal = 100, contrastVal = 100, saturateVal = 100;

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

  function captionNativePos(cap: Caption): { left: number; top: number } {
    const style = cap.style;
    const top = (style.position.y / 100) * nativeHeight;
    let left = nativeWidth / 2;
    if (typeof style.position.x === 'number') left = (style.position.x / 100) * nativeWidth;
    else if (style.position.x === 'left') left = 80;
    else if (style.position.x === 'right') left = nativeWidth - 80;
    return { left, top };
  }

  function nativeToStorePercentage(nativeLeft: number, nativeTop: number) {
    return {
      x: Math.round(((nativeLeft / nativeWidth) * 100) * 100) / 100,
      y: Math.round(((nativeTop / nativeHeight) * 100) * 100) / 100,
    };
  }

  const onCaptionMouseDown = (e: React.MouseEvent, cap: Caption) => {
    if (isSpacePressed || contentZoom > 1.0) return;
    e.stopPropagation();
    const idToUse = selectedCaptionId === 'bulk' ? 'bulk' : cap.id;
    setSelected({ type: 'caption', id: idToUse });
    if (selectedCaptionId !== 'bulk') selectCaption(cap.id);
    const pos = captionNativePos(cap);
    setDragState({ startMouseX: e.clientX, startMouseY: e.clientY, startElX: pos.left, startElY: pos.top });
  };

  const onStickerMouseDown = (e: React.MouseEvent, sticker: StickerOverlay) => {
    if (isSpacePressed || contentZoom > 1.0) return;
    e.stopPropagation();
    setSelected({ type: 'sticker', id: sticker.id });
    selectCaption(null);
    const interpolated = getInterpolatedSticker(sticker);
    setDragState({
      startMouseX: e.clientX, startMouseY: e.clientY, startElX: interpolated.x, startElY: interpolated.y,
      startInitialX: sticker.initialX, startInitialY: sticker.initialY, startFinalX: sticker.finalX, startFinalY: sticker.finalY,
    });
  };

  const onResizeMouseDown = (e: React.MouseEvent, el: any, elType: 'caption' | 'sticker', handle: ResizeState['handle']) => {
    e.stopPropagation(); e.preventDefault();
    if (elType === 'sticker') {
      const interpolated = getInterpolatedSticker(el);
      setResizeState({
        startMouseX: e.clientX, startMouseY: e.clientY, startElX: interpolated.x, startElY: interpolated.y,
        startW: interpolated.width, startH: interpolated.height, handle,
        startInitialX: el.initialX, startInitialY: el.initialY, startFinalX: el.finalX, startFinalY: el.finalY,
        startInitialWidth: el.initialWidth, startInitialHeight: el.initialHeight, startFinalWidth: el.finalWidth, startFinalHeight: el.finalHeight,
      });
    } else if (elType === 'caption') {
      const pos = captionNativePos(el);
      setResizeState({ startMouseX: e.clientX, startMouseY: e.clientY, startElX: pos.left, startElY: pos.top, startW: el.style.width ? el.style.width : 600, startH: 0, handle });
    }
  };

  const onCanvasBackgroundMouseDown = (e: React.MouseEvent) => {
    const isBgTarget = e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'VIDEO' || (e.target as HTMLElement).id === 'alignment-grid';
    if (isBgTarget || isSpacePressed || contentZoom > 1.0) {
      setVideoPanState({
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startVideoX: videoX,
        startVideoY: videoY
      });
    }
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (videoPanState) {
      const dx = (e.clientX - videoPanState.startMouseX) / baseScaleFactor;
      const dy = (e.clientY - videoPanState.startMouseY) / baseScaleFactor;
      setProjectState({
        videoX: videoPanState.startVideoX + dx,
        videoY: videoPanState.startVideoY + dy
      });
      return;
    }

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
            updateSticker(selected.id, {
              x: Math.round(newLeft), y: Math.round(newTop),
              initialX: (dragState.startInitialX ?? currentSticker.x) + Math.round(dx),
              initialY: (dragState.startInitialY ?? currentSticker.y) + Math.round(dy),
              finalX: (dragState.startFinalX ?? currentSticker.x) + Math.round(dx),
              finalY: (dragState.startFinalY ?? currentSticker.y) + Math.round(dy),
            });
          } else {
            updateSticker(selected.id, { x: Math.round(newLeft), y: Math.round(newTop) });
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
        if (resizeState.startInitialWidth !== undefined && resizeState.startFinalWidth !== undefined) {
          updateSticker(selected.id, {
            initialWidth: Math.max(50, (resizeState.startInitialWidth ?? 0) + (targetWidth - resizeState.startW)),
            initialHeight: Math.max(50, (resizeState.startInitialHeight ?? 0) + (targetHeight - resizeState.startH)),
            finalWidth: Math.max(50, (resizeState.startFinalWidth ?? 0) + (targetHeight - resizeState.startH)),
            finalHeight: Math.max(50, (resizeState.startFinalHeight ?? 0) + (targetHeight - resizeState.startH)),
          });
        } else {
          updateSticker(selected.id, { width: Math.round(targetWidth), height: Math.round(targetHeight) });
        }
      } else if (selected.type === 'caption') {
        const deltaX = (resizeState.handle === 'tr' || resizeState.handle === 'br') ? dx : -dx;
        const currentCaption = project.captions.find(c => c.id === selected.id);
        const isCentered = !currentCaption || currentCaption.style.position.x === 'center' || currentCaption.style.position.x === 50;
        const finalRenderWidth = Math.max(200, Math.min(nativeWidth - 40, resizeState.startW + (deltaX * (isCentered ? 2 : 1))));

        if (selected.id === 'bulk') {
          project.captions.forEach(c => updateCaptionStyle(c.id, { width: Math.round(finalRenderWidth) } as any));
        } else {
          updateCaptionStyle(selected.id, { width: Math.round(finalRenderWidth) } as any);
        }
      }
    }
  }, [dragState, resizeState, videoPanState, selected, scaleFactor, baseScaleFactor, nativeWidth, nativeHeight, project.captions, project.overlays, updateCaptionStyle, updateSticker]);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', () => { 
      setDragState(null); 
      setResizeState(null); 
      setVideoPanState(null);
    });
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [onMouseMove]);

  const isSelectedCaption = (id: string) => selected?.type === 'caption' && (selected.id === id || selected.id === 'bulk');
  const isSelectedSticker = (id: string) => selected?.type === 'sticker' && selected.id === id;

  const outerCompositionTransform = `scale(${baseScaleFactor}) translate(${videoX}px, ${videoY}px)`;
  const innerAssetMirrorTransform = `scaleX(${flipHorizontal ? -1 : 1}) scaleY(${flipVertical ? -1 : 1})`;
  const internalZoomTransform = `scale(${contentZoom})`;
  const gridSize = (nativeWidth / 21) * contentZoom;

  return (
    <div style={{ position: 'relative', display: 'inline-block', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div
        ref={canvasRef}
        onMouseDown={(e) => {
          onCanvasBackgroundMouseDown(e);
          const isBgTarget = e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'VIDEO' || (e.target as HTMLElement).id === 'alignment-grid';
          if (isBgTarget) {
            setSelected(null);
            selectCaption(null);
          }
        }}
        style={{
          position: 'relative', 
          width: displayWidth,   
          height: displayHeight, 
          background: '#000',
          borderRadius: 14, 
          overflow: 'hidden', 
          border: '1px solid #2a2a2e', 
          flexShrink: 0,
          cursor: videoPanState ? 'grabbing' : (isSpacePressed || contentZoom > 1.0 ? 'grab' : 'default'), 
          userSelect: 'none',
        }}
      >

         <div 
              id="alignment-grid"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                // Always visible, subtle opacity that slightly increases as you zoom in for precision
                opacity: 2.15 + (contentZoom * 0.1), 
                zIndex: 2,
                backgroundImage: `
                  linear-gradient(to right, rgba(255, 255, 255, 0.3) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255, 255, 255, 0.3) 1px, transparent 1px)
                `,
                // DENSITY LOGIC: 
                // Divide native dimensions by a constant (e.g., 12) 
                // Multiply by contentZoom so the grid lines stay 'locked' to the video pixels
                backgroundSize: `${gridSize}px ${gridSize}px`,
                // Smooth transition when zooming
                transition: 'background-size 0.1s linear, opacity 0.2s ease'
              }}
            />

        {/* Composition Root Layer */}
        <div 
          style={{ 
            width: nativeWidth, 
            height: nativeHeight, 
            position: 'absolute', 
            top: 0, 
            left: 0,
            transform: outerCompositionTransform,
            transformOrigin: 'top left',
          }}
        >
          {/* Internal Scaled & Mirrored Sub-Layer */}
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              transform: `${internalZoomTransform} ${innerAssetMirrorTransform}`,
              transformOrigin: 'center center',
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
                    el.volume = videoVolume;
                    const targetTime = currentFrame / fps;
                    if (Math.abs(el.currentTime - targetTime) > 0.2) el.currentTime = targetTime;
                    if (isPlaying) {
                      if (Math.abs(el.currentTime - targetTime) > 1.0) el.currentTime = targetTime;
                      if (el.paused) el.play().catch(() => {});
                    } else {
                      el.pause();
                      if (Math.abs(el.currentTime - targetTime) > 0.03) el.currentTime = targetTime;
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

            {/* Environmental Filter Overlays */}
            {activeVignette && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'radial-gradient(ellipse, transparent 50%, rgba(0,0,0,0.8) 100%)', pointerEvents: 'none', zIndex: 3 }} />}
            {activeLightLeak && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(45deg,rgba(255,200,100,0.3),transparent)', pointerEvents: 'none', zIndex: 3 }} />}
            {activeFilmGrain && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.02) 0px,rgba(0,0,0,0.02) 1px)', pointerEvents: 'none', zIndex: 3 }} />}
            {activeCoolTone && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(135deg,rgba(0,150,255,0.2),transparent)', pointerEvents: 'none', zIndex: 3 }} />}

            {/* Stickers Layer */}
            {visibleStickers.map(sticker => {
              const interpolated = getInterpolatedSticker(sticker);
              const isSel = isSelectedSticker(sticker.id);
              const relativeFrame = Math.max(0, currentFrame - Math.round(sticker.start * fps));
              const inDuration = 8;
              let stickerOpacity = 1;
              let baseTransform = `rotate(${interpolated.rotation || 0}deg)`;

              const anim = (sticker as any).animation || 'none';
              if (anim === 'fade') stickerOpacity = Math.min(1, relativeFrame / inDuration);
              else if (anim === 'pop') baseTransform += ` scale(${relativeFrame >= inDuration ? 1 : 0.6 + 0.4 * Math.min(1, relativeFrame / inDuration)})`;

              return (
                <div
                  key={sticker.id}
                  onMouseDown={e => onStickerMouseDown(e, sticker)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', left: interpolated.x, top: interpolated.y, width: interpolated.width, height: interpolated.height,
                    cursor: isSpacePressed || contentZoom > 1.0 ? 'inherit' : 'move', transform: baseTransform, opacity: stickerOpacity, transformOrigin: 'center center',
                    outline: isSel ? `${4 / scaleFactor}px solid #6366f1` : 'none', boxSizing: 'border-box', zIndex: 5,
                    pointerEvents: isSpacePressed || contentZoom > 1.0 ? 'none' : 'auto'
                  }}
                >
                  <img src={sticker.assetUrl} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', display: 'block' }} alt="" />
                  {isSel && !isSpacePressed && contentZoom <= 1.0 && (
                    <>
                      <SelectionHandles scaleFactor={scaleFactor} onResize={(e, handle) => onResizeMouseDown(e, sticker, 'sticker', handle)} />
                      <DeleteBtn scaleFactor={scaleFactor} onClick={() => { useProjectStore.getState().removeSticker(sticker.id); setSelected(null); }} />
                    </>
                  )}
                </div>
              );
            })}

            {/* Captions Layer */}
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
              const currentAnimType = style.animation || 'none';

              if (!(style as any).wordByWord) {
                if (currentAnimType === 'fade') animOpacity = Math.min(1, relativeFrame / inDuration);
                else if (currentAnimType === 'pop') animTransform = `scale(${relativeFrame >= inDuration ? 1 : 0.6 + 0.4 * Math.min(1, relativeFrame / inDuration)})`;
              }

              return (
                <div
                  key={cap.id}
                  onMouseDown={e => onCaptionMouseDown(e, cap)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    position: 'absolute', left, top, transform: animTransform ? `${baseTransform} ${animTransform}` : baseTransform,
                    opacity: animOpacity, cursor: isSpacePressed || contentZoom > 1.0 ? 'inherit' : 'move', width: (style as any).width ? `${(style as any).width}px` : '85%', maxWidth: '95%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 40px', borderRadius: style.borderRadius || 8,
                    background: bgCss, color: style.color, fontFamily: style.fontFamily || 'inherit', fontSize: style.fontSize || 48,
                    fontWeight: (style as any).fontWeight || 700, lineHeight: 1.35, textAlign: ((style as any).textAlign as any) || 'center',
                    whiteSpace: 'normal', wordBreak: 'break-word', outline: isSel ? `${4 / scaleFactor}px solid #6366f1` : 'none', outlineOffset: 4, boxSizing: 'border-box', zIndex: 10,
                    pointerEvents: isSpacePressed || contentZoom > 1.0 ? 'none' : 'auto'
                  }}
                >
                  {isSel && contentZoom <= 1.0 ? (
                    <textarea
                      value={cap.text}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      onChange={e => {
                        useProjectStore.setState(state => ({
                          project: {
                            ...state.project,
                            captions: state.project.captions.map(c => c.id === cap.id ? { ...c, text: e.target.value } : c),
                          },
                        }));
                      }}
                      style={{
                        background: 'transparent', border: 'none', outline: 'none', color: style.color, fontFamily: style.fontFamily || 'inherit',
                        fontSize: style.fontSize || 48, fontWeight: (style as any).fontWeight || 700, textAlign: ((style as any).textAlign as any) || 'center',
                        width: '100%', resize: 'none', overflow: 'hidden', padding: 0, margin: 0, lineHeight: 1.35, whiteSpace: (style as any).width ? 'normal' : 'nowrap', wordBreak: 'keep-all',
                      }}
                      rows={1}
                      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                    />
                  ) : (
                    <div style={{ width: '100%' }}>
                      {(style as any).wordByWord ? (
                        <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: (style as any).textAlign || 'center', width: '100%' }}>
                          {(cap.words && cap.words.length > 0 ? cap.words : cap.text.split(/\s+/).filter(Boolean).map((w, i, arr) => ({ text: w, start: cap.start + (i * ((cap.end - cap.start) / arr.length)), end: cap.start + ((i + 1) * ((cap.end - cap.start) / arr.length)) }))).map((w, i) => {
                            const targetWordStyles = getUnifiedAnimationStyles(currentAnimType, currentFrame - Math.round(w.start * fps), fps);
                            return (
                              <span key={i} style={{ marginRight: '0.25em', display: 'inline-block', opacity: targetWordStyles.opacity, transform: targetWordStyles.transform, transformOrigin: 'center center', color: style.color }}>
                                {w.text}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ width: '100%' }}>
                          {cap.text.split(/\s+/).map((w, i) => (
                            <span key={i} style={{ color: (style.highlightWords || []).includes(w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"")) ? style.highlightColor || '#ef4444' : style.color, marginRight: '0.25em' }}>
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Control Configuration Panel */}
      <div style={{ position: 'absolute', bottom: 12, right: -52, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {isMenuOpen && (
          <div style={{ background: 'rgba(24, 24, 28, 0.95)', backdropFilter: 'blur(8px)', border: '1px solid #2a2a2e', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', width: 190, fontSize: 11, color: '#fff' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: '#8e8e93', fontWeight: 600, letterSpacing: '0.02em' }}>RESOLUTION ORIENTATION</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => { setProjectState({ resolution: { width: 1080, height: 1920 }, videoX: 0, videoY: 0 }); }} style={{ flex: 1, padding: '6px 0', background: nativeWidth === 1080 && nativeHeight === 1920 ? '#6366f1' : '#2a2a2e', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Portrait</button>
                <button onClick={() => { setProjectState({ resolution: { width: 1920, height: 1080 }, videoX: 0, videoY: 0 }); }} style={{ flex: 1, padding: '6px 0', background: nativeWidth === 1920 && nativeHeight === 1080 ? '#6366f1' : '#2a2a2e', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Landscape</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button onClick={() => { setProjectState({ videoX: 0, videoY: 0, contentZoom: 1.0 }); }} style={{ width: '100%', padding: '6px 0', background: '#2a2a2e', border: '1px solid #3a3a3e', borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Reset Viewport Layer</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ color: '#8e8e93', fontWeight: 600, letterSpacing: '0.02em' }}>MIRROR TRANSLATION</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setProjectState({ flipHorizontal: !flipHorizontal })} style={{ flex: 1, padding: '6px 0', background: flipHorizontal ? '#6366f1' : '#2a2a2e', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Flip Horiz.</button>
                <button onClick={() => setProjectState({ flipVertical: !flipVertical })} style={{ flex: 1, padding: '6px 0', background: flipVertical ? '#6366f1' : '#2a2a2e', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, fontWeight: 500, cursor: 'pointer' }}>Flip Vert.</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#8e8e93', fontWeight: 600 }}>INNER CANVAS ZOOM</span>
                <span style={{ fontFamily: 'monospace', color: '#6366f1' }}>{Math.round(contentZoom * 100)}%</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.05" value={contentZoom} onChange={e => setProjectState({ contentZoom: parseFloat(e.target.value) })} style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer', margin: '4px 0' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#8e8e93', fontWeight: 600 }}>VOLUME COEFFICIENT</span>
                <span style={{ fontFamily: 'monospace', color: '#6366f1' }}>{Math.round(videoVolume * 100)}%</span>
              </div>
              <input type="range" min="0.0" max="1.0" step="0.05" value={videoVolume} onChange={e => setVideoVolume(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer', margin: '4px 0' }} />
            </div>
          </div>
        )}
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)} 
          style={{ 
            background: '#2a2a2e', border: '1px solid #3a3a3e', color: '#fff', borderRadius: '50%', width: 36, height: 36, 
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'transform 0.2s ease', transform: isMenuOpen ? 'rotate(90deg)' : 'rotate(0deg)' 
          }}
        >
          {isMenuOpen ? '✕' : '⚙️'}
        </button>
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
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute', top: -size/2, right: -size/2, width: size, height: size,
        background: '#ef4444', color: '#fff', borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: `${10/scaleFactor}px`,
        fontWeight: 'bold', cursor: 'pointer', zIndex: 100, boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}
    >
      ✕
    </div>
  );
};