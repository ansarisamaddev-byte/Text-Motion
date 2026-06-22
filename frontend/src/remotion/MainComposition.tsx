import React from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill, OffthreadVideo } from 'remotion';
import type { ProjectState } from '../store/projectStore';
import { getUnifiedAnimationStyles } from './sharedAnimations';

export const MainComposition: React.FC<{ project: ProjectState }> = ({ project }) => {
  const currentFrame = useCurrentFrame();
  const { fps, width: nativeWidth, height: nativeHeight } = useVideoConfig();
  const currentTime = currentFrame / fps;

  const visibleCaptions = project.captions.filter(c => currentTime >= c.start && currentTime <= c.end);
  const visibleStickers = project.overlays.filter(o => currentTime >= o.start && currentTime <= o.end);
  const activeFilters = project.filters.filter(f => currentTime >= f.start && currentTime <= f.end);

  // Read positional alignment values computed directly from project store parameters
  const videoX = project.videoX ?? 0;
  const videoY = project.videoY ?? 0;
  const contentZoom = project.contentZoom ?? 1.0;
  const flipHorizontal = project.flipHorizontal ?? false;
  const flipVertical = project.flipVertical ?? false;

  const resolveEasing = (easingStr: string | undefined) => {
    if (easingStr === 'ease-in') return (t: number) => t * t;
    if (easingStr === 'ease-out') return (t: number) => t * (2 - t);
    if (easingStr === 'ease-in-out') return (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    return (t: number) => t;
  };

  let videoFilterStr = '';
  let brightnessVal = 100, contrastVal = 100, saturateVal = 100;
  activeFilters.forEach(f => {
    if (f.type === 'grayscale') videoFilterStr += 'grayscale(1) ';
    if (f.type === 'sepia') videoFilterStr += 'sepia(1) ';
    if (f.type === 'brightness') brightnessVal = f.intensity > 2 ? f.intensity : f.intensity * 100;
    if (f.type === 'contrast') contrastVal = f.intensity > 2 ? f.intensity : f.intensity * 100;
    if (f.type === 'saturate') saturateVal = f.intensity > 2 ? f.intensity : f.intensity * 100;
  });
  videoFilterStr += `brightness(${brightnessVal}%) contrast(${contrastVal}%) saturate(${saturateVal}%)`;

  const activeVignette = activeFilters.some(f => f.type === 'vignette' || f.id === 'overlay-vignette');
  const activeLightLeak = activeFilters.some(f => f.type === 'light-leak' || f.id === 'overlay-light-leak');
  const activeFilmGrain = activeFilters.some(f => f.type === 'film-grain' || f.id === 'overlay-film-grain');
  const activeCoolTone = activeFilters.some(f => f.type === 'cool-tone' || f.id === 'overlay-cool-tone');

  // Compute unified transformation strings to reflect canvas tracking transforms
  const backgroundPositionTransform = [
    `translate(${videoX}px, ${videoY}px)`,
    `scaleX(${flipHorizontal ? -1 : 1})`,
    `scaleY(${flipVertical ? -1 : 1})`
  ].join(' ');

  const contentScaleTransform = `scale(${contentZoom})`;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Transformed Video Tracking Layer Container */}
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          position: 'absolute', 
          filter: videoFilterStr,
          transform: backgroundPositionTransform,
          transformOrigin: 'center center'
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: contentScaleTransform, transformOrigin: 'center center' }}>
          {project.videoSrc && (
            <OffthreadVideo
              src={project.videoSrc}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
      </div>

      {/* Environmental Shader Visual Blend Nodes */}
      {activeVignette && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'multiply', background: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 100%)' }} />}
      {activeCoolTone && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'color', backgroundColor: 'rgba(0, 100, 255, 0.15)' }} />}
      {activeLightLeak && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.4, background: 'linear-gradient(45deg, #ff7b00 0%, transparent 70%)' }} />}
      {activeFilmGrain && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05, backgroundImage: `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjZmZmIi8+Cjwvc3ZnPg==")`, backgroundRepeat: 'repeat' }} />}

      {/* Stickers Overlay Tracking Layer */}
      {visibleStickers.map(sticker => {
        const hasMotion = sticker.initialX !== undefined && sticker.finalX !== undefined;
        let sx = sticker.x, sy = sticker.y, sw = sticker.width, sh = sticker.height, srot = sticker.rotation;

        if (hasMotion) {
          const durFrames = Math.max(1, Math.round((sticker.end - sticker.start) * fps));
          const itemFrame = Math.max(0, Math.min(durFrames - 1, currentFrame - Math.round(sticker.start * fps)));
          const t = itemFrame / (durFrames - 1 || 1);
          const easing = resolveEasing(sticker.motionEasing);
          const easedT = easing(t);

          sx = (sticker.initialX ?? sticker.x) + ((sticker.finalX ?? sticker.x) - (sticker.initialX ?? sticker.x)) * easedT;
          sy = (sticker.initialY ?? sticker.y) + ((sticker.finalY ?? sticker.y) - (sticker.initialY ?? sticker.y)) * easedT;
          sw = (sticker.initialWidth ?? sticker.width) + ((sticker.finalWidth ?? sticker.width) - (sticker.initialWidth ?? sticker.width)) * easedT;
          sh = (sticker.initialHeight ?? sticker.height) + ((sticker.finalHeight ?? sticker.height) - (sticker.initialHeight ?? sticker.height)) * easedT;
          srot = (sticker.initialRotation ?? sticker.rotation) + ((sticker.finalRotation ?? sticker.rotation) - (sticker.initialRotation ?? sticker.rotation)) * easedT;
        }

        return (
          <div
            key={sticker.id}
            style={{
              position: 'absolute',
              left: sx,
              top: sy,
              width: sw,
              height: sh,
              transform: `translate(-50%, -50%) rotate(${srot}deg)`,
            }}
          >
            <img src={sticker.url} alt="Sticker" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        );
      })}

      {/* Typography Captions Tracking Layer */}
      {visibleCaptions.map(cap => {
        const style = cap.style;
        const top = (style.position.y / 100) * nativeHeight;
        let left = nativeWidth / 2;
        if (typeof style.position.x === 'number') left = (style.position.x / 100) * nativeWidth;
        else if (style.position.x === 'left') left = 80;
        else if (style.position.x === 'right') left = nativeWidth - 80;

        const frameDelta = Math.max(0, currentFrame - Math.round(cap.start * fps));
        const currentAnimType = style.animation || 'none';
        const animStyles = getUnifiedAnimationStyles(currentAnimType, frameDelta, fps);

        return (
          <div
            key={cap.id}
            style={{
              position: 'absolute',
              left,
              top,
              width: style.width || 600,
              transform: 'translate(-50%, -50%)',
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: style.textAlign || 'center',
            }}
          >
            <div
              style={{
                color: style.color || '#ffffff',
                fontSize: `${style.fontSize || 48}px`,
                fontWeight: style.fontWeight || 'bold',
                textShadow: style.textShadow || '2px 2px 4px rgba(0,0,0,0.8)',
                fontFamily: style.fontFamily || 'Impact, sans-serif',
                textTransform: style.textTransform || 'uppercase',
                width: '100%',
                wordBreak: 'break-word',
                opacity: animStyles.opacity,
                transform: animStyles.transform,
              }}
            >
              {currentAnimType === 'word-by-word' && cap.words ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {cap.words.map((w, i) => {
                    const wordDelta = currentFrame - Math.round(w.start * fps);
                    const wordStyles = getUnifiedAnimationStyles(currentAnimType, wordDelta, fps);

                    return (
                      <span
                        key={i}
                        style={{
                          marginRight: '0.25em',
                          display: 'inline-block',
                          opacity: wordStyles.opacity,
                          transform: wordStyles.transform,
                          transformOrigin: 'center center',
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
                  return <span key={i} style={{ color: active ? style.highlightColor || '#ef4444' : style.color, marginRight: '0.25em' }}>{w.text}</span>;
                })
              ) : (
                <span>{currentAnimType === 'typewriter' ? cap.text.slice(0, Math.floor(frameDelta * 0.8)) : cap.text}</span>
              )}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};