// sharedAnimations.ts
import { spring, interpolate } from 'remotion';

export interface AnimationStyles {
  opacity: number;
  transform: string;
}

/**
 * Single source of truth for both Canvas Preview and Headless Export.
 * Calculates perfectly deterministic frame-by-frame styles.
 */
export const getUnifiedAnimationStyles = (
  animType: string,
  frameDelta: number,
  targetFps: number
): AnimationStyles => {
  let opacity = 1;
  let transform = '';

  if (frameDelta < 0) {
    opacity = 0;
    if (animType === 'slide-up') transform = 'translateY(24px)';
    if (animType === 'pop' || animType === 'zoom') transform = 'scale(0)';
    return { opacity, transform };
  }

  const inDurationFrames = 8; // Standard scale threshold threshold

  switch (animType) {
    case 'fade': {
      opacity = Math.min(1, frameDelta / inDurationFrames);
      break;
    }
    case 'pop': {
      const progress = Math.min(1, frameDelta / inDurationFrames);
      opacity = 1;
      transform = `scale(${0.5 + 0.5 * progress})`;
      break;
    }
    case 'slide-up': {
      const progress = Math.min(1, frameDelta / inDurationFrames);
      opacity = progress;
      transform = `translateY(${24 * (1 - progress)}px)`;
      break;
    }
    case 'zoom': {
      const progress = Math.min(1, frameDelta / inDurationFrames);
      opacity = progress;
      transform = `scale(${progress})`;
      break;
    }
    case 'bounce': {
      const spr = spring({
        frame: frameDelta,
        fps: targetFps,
        config: {
          damping: 11,
          mass: 0.5,
          stiffness: 130,
        },
      });
      const ty = interpolate(spr, [0, 1], [35, 0]);
      transform = `translateY(${ty}px)`;
      opacity = 1;
      break;
    }
    case 'shake': {
      opacity = 1;
      if (frameDelta < inDurationFrames) {
        const intensity = 6 * (1 - frameDelta / inDurationFrames);
        transform = `translateX(${Math.sin(frameDelta * 1.5) * intensity}px)`;
      }
      break;
    }
    default:
      opacity = 1;
      break;
  }

  return { opacity, transform };
};