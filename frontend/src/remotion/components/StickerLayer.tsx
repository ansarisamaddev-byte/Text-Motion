import React from 'react';
import { Sequence, Img, useCurrentFrame, interpolate, Easing } from 'remotion';
import type { StickerOverlay } from '../../types';

interface StickerLayerProps {
  overlays: StickerOverlay[];
  fps: number;
}

export const StickerLayer: React.FC<StickerLayerProps> = ({ overlays, fps }) => {
  const stickers = (overlays || []).filter(o => o.type === 'sticker');

  return (
    <>
      {stickers.map((overlay) => (
        <AnimatedSticker key={overlay.id} overlay={overlay} fps={fps} />
      ))}
    </>
  );
};

function resolveEasing(motionEasing: string | undefined): (t: number) => number {
  switch (motionEasing) {
    case 'ease-in':     return Easing.in(Easing.ease);
    case 'ease-out':    return Easing.out(Easing.ease);
    case 'ease-in-out': return Easing.inOut(Easing.ease);
    case 'bounce':      return Easing.out(Easing.bounce);
    case 'linear':
    default:            return Easing.linear;
  }
}

const AnimatedSticker: React.FC<{ overlay: StickerOverlay; fps: number }> = ({
  overlay,
  fps,
}) => {
  const frame = useCurrentFrame();

  const from = Math.round(overlay.start * fps);
  const durationInFrames = Math.max(1, Math.round((overlay.end - overlay.start) * fps));

  const startX = overlay.initialX ?? overlay.x;
  const startY = overlay.initialY ?? overlay.y;
  const startWidth = overlay.initialWidth ?? overlay.width;
  const startHeight = overlay.initialHeight ?? overlay.height;
  const startRotation = overlay.initialRotation ?? overlay.rotation ?? 0;

  const endX = overlay.finalX ?? startX;
  const endY = overlay.finalY ?? startY;
  const endWidth = overlay.finalWidth ?? startWidth;
  const endHeight = overlay.finalHeight ?? startHeight;
  const endRotation = overlay.finalRotation ?? startRotation;

  const easing = resolveEasing(overlay.motionEasing);

  const hasKeyframeInterpolation =
    startX !== endX ||
    startY !== endY ||
    startWidth !== endWidth ||
    startHeight !== endHeight ||
    startRotation !== endRotation;

  const x = hasKeyframeInterpolation
    ? interpolate(frame, [0, durationInFrames - 1], [startX, endX], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : startX;

  const y = hasKeyframeInterpolation
    ? interpolate(frame, [0, durationInFrames - 1], [startY, endY], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : startY;

  const width = hasKeyframeInterpolation
    ? interpolate(frame, [0, durationInFrames - 1], [startWidth, endWidth], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : startWidth;

  const height = hasKeyframeInterpolation
    ? interpolate(frame, [0, durationInFrames - 1], [startHeight, endHeight], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : startHeight;

  const rotation = hasKeyframeInterpolation
    ? interpolate(frame, [0, durationInFrames - 1], [startRotation, endRotation], { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : startRotation;

  let entranceTransform = '';
  let opacity = 1;
  const animDuration = Math.min(15, durationInFrames);

  if (overlay.animation && overlay.animation !== 'none') {
    switch (overlay.animation) {
      case 'fade':
        opacity = interpolate(frame, [0, animDuration], [0, 1], { extrapolateRight: 'clamp' });
        break;

      case 'pop':
      case 'zoom': {
        const progressPop = interpolate(frame, [0, animDuration], [0.5, 1], { easing: Easing.out(Easing.back(1.5)), extrapolateRight: 'clamp' });
        entranceTransform += ` scale(${progressPop})`;
        break;
      }

      case 'bounce': {
        const progressBounce = interpolate(frame, [0, animDuration], [0.3, 1], { easing: Easing.out(Easing.bounce), extrapolateRight: 'clamp' });
        entranceTransform += ` scale(${progressBounce})`;
        break;
      }

      case 'slide-up': {
        const translateY = interpolate(frame, [0, animDuration], [80, 0], { easing: Easing.out(Easing.quad), extrapolateRight: 'clamp' });
        entranceTransform += ` translateY(${translateY}px)`;
        opacity = interpolate(frame, [0, animDuration], [0, 1], { extrapolateRight: 'clamp' });
        break;
      }

      case 'shake':
        if (frame < 24) {
          const intensity = interpolate(frame, [0, 24], [20, 0], { extrapolateRight: 'clamp' });
          const wave = Math.sin(frame * 0.9) * intensity;
          entranceTransform += ` translateX(${wave}px)`;
        }
        break;
    }
  }

  // overlay.x/y/width/height are already stored in full output-resolution pixels
  // (same space as project.resolution.width/height), so they map 1:1 onto the
  // rendered frame — no extra scaling needed.
  return (
    <Sequence from={from} durationInFrames={durationInFrames} layout="none">
      <Img
        src={overlay.assetUrl}
        style={{
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          opacity,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)${entranceTransform}`,
          transformOrigin: 'center center',
          objectFit: 'contain',
        }}
      />
    </Sequence>
  );
};