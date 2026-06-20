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

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Base Background Video Processing Layer */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', filter: videoFilterStr }}>
        {project.videoSrc && (
          <OffthreadVideo
            src={project.videoSrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </div>

      {/* Replicated High-Fidelity Rendering: Stickers Layer */}
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

        // Uses the newly unified animation configuration
        const animStyles = getUnifiedAnimationStyles((sticker as any).animation || 'none', currentFrame - Math.round(sticker.start * fps), fps);

        return (
          <div
            key={sticker.id}
            style={{
              position: 'absolute', left: sx, top: sy, width: sw, height: sh,
              transform: `rotate(${srot || 0}deg) ${animStyles.transform}`, opacity: animStyles.opacity,
              transformOrigin: 'center center', zIndex: 5
            }}
          >
            <img src={sticker.assetUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
          </div>
        );
      })}

      {/* Replicated High-Fidelity Rendering: Captions Layer */}
      {visibleCaptions.map(cap => {
        const style = cap.style;
        const top = (style.position.y / 100) * nativeHeight;
        const left = typeof style.position.x === 'number' ? (style.position.x / 100) * nativeWidth : nativeWidth / 2;
        const bg = style.backgroundColor;
        const bgCss = typeof bg === 'string' ? bg : `rgba(${bg.r},${bg.g},${bg.b},${bg.a})`;

        const frameDelta = currentFrame - Math.round(cap.start * fps);
        const currentAnimType = style.animation || 'none';
        
        // Uses unified calculation for container layouts
        const containerAnim = !(style as any).wordByWord ? getUnifiedAnimationStyles(currentAnimType, frameDelta, fps) : { opacity: 1, transform: '' };

        return (
          <div
            key={cap.id}
            style={{
              position: 'absolute', left, top,
              transform: `translate(-50%, -50%) ${containerAnim.transform}`, opacity: containerAnim.opacity,
              width: (style as any).width ? `${(style as any).width}px` : '85%', maxWidth: '95%',
              padding: '16px 40px', borderRadius: style.borderRadius || 8, background: bgCss, color: style.color,
              fontFamily: style.fontFamily || 'inherit', fontSize: style.fontSize || 48, fontWeight: (style as any).fontWeight || 700,
              textAlign: ((style as any).textAlign as any) || 'center', wordBreak: 'break-word', zIndex: 10, boxSizing: 'border-box'
            }}
          >
            <div style={{ width: '100%' }}>
              {(style as any).wordByWord ? (
                <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: (style as any).textAlign || 'center', width: '100%' }}>
                  {(cap.words && cap.words.length > 0 ? cap.words : cap.text.split(/\s+/).map((w, i, arr) => ({ text: w, start: cap.start + (i * ((cap.end - cap.start) / arr.length)), end: cap.start + ((i + 1) * ((cap.end - cap.start) / arr.length)) }))).map((w, i) => {
                    const wordDelta = currentFrame - Math.round(w.start * fps);
                    
                    // Direct parity fix targeting individual words via getUnifiedAnimationStyles
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