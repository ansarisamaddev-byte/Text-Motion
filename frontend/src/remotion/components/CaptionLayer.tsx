import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import type { Caption, CaptionStyle } from '../../types';
import { WordHighlight } from '../captions/WordHighlight';

interface CaptionLayerProps {
  captions: Caption[];
  fps: number;
}

export const CaptionLayer: React.FC<CaptionLayerProps> = ({ captions, fps }) => {
  return (
    <>
      {captions.map((caption) => {
        const from = Math.round(caption.start * fps);
        const durationInFrames = Math.max(1, Math.round((caption.end - caption.start) * fps));

        return (
          <Sequence key={caption.id} from={from} durationInFrames={durationInFrames} layout="none">
            <SingleCaption caption={caption} captionDuration={durationInFrames} />
          </Sequence>
        );
      })}
    </>
  );
};

const SingleCaption: React.FC<{ caption: Caption; captionDuration: number }> = ({
  caption,
  captionDuration
}) => {
  const frame = useCurrentFrame(); // relative to the Sequence's `from`
  const { fps } = useVideoConfig();
  const style = caption.style;

  const animStyle = getAnimationStyle(style.animation, frame, captionDuration);

  // style.position.x/y are stored as percentages (0-100) — set via drag on the
  // editor canvas or from a preset/template — so they map directly to CSS %.
  // style.fontSize/borderRadius are stored in full output-resolution pixels
  // (same space as project.resolution.width/height), so they're used as-is.
  let left: React.CSSProperties['left'] = '50%';
  let transform = 'translateX(-50%)';

  if (style.position.x === 'left') {
    left = '5%';
    transform = 'translateX(0)';
  } else if (style.position.x === 'right') {
    left = '95%';
    transform = 'translateX(-100%)';
  } else if (typeof style.position.x === 'number') {
    left = `${style.position.x}%`;
    transform = 'translateX(-50%)';
  }

  const top: React.CSSProperties['top'] = `${style.position.y}%`;

  const bg = style.backgroundColor;

  let displayText = caption.text;
  if (style.animation === 'typewriter') {
    const charsPerFrame = 1.5;
    const visibleChars = Math.floor(frame * charsPerFrame);
    displayText = caption.text.slice(0, visibleChars);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: `${transform} ${animStyle.transform || ''}`.trim(),
        opacity: animStyle.opacity,
        maxWidth: '90%',
        padding: '0.3em 0.6em',
        borderRadius: `${style.borderRadius}px`,
        backgroundColor: `rgba(${bg.r}, ${bg.g}, ${bg.b}, ${bg.a})`,
        fontFamily: style.fontFamily,
        fontSize: `${style.fontSize}px`,
        fontWeight: style.fontWeight ? Number(style.fontWeight) : 700,
        textAlign: (style.textAlign as React.CSSProperties['textAlign']) || 'center',
        lineHeight: 1.3,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {style.wordByWord ? (
        <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: style.textAlign || 'center', width: '100%' }}>
          {caption.words && caption.words.length > 0 ? (
            caption.words.map((w, i) => {
              const wordStartFrame = Math.round((w.start - caption.start) * fps);
              const wordElapsedFrames = frame - wordStartFrame;
              let wordOpacity = 0;
              let wordTransform = 'scale(0.8)';

              if (wordElapsedFrames >= 0) {
                const progress = Math.min(1, wordElapsedFrames / 4);
                wordOpacity = progress;
                wordTransform = `scale(${0.8 + 0.2 * progress})`;
              }

              return (
                <span
                  key={i}
                  style={{
                    marginRight: '0.25em',
                    display: 'inline-block',
                    opacity: wordOpacity,
                    transform: wordTransform,
                    transformOrigin: 'center center',
                    color: style.color
                  }}
                >
                  {w.text}
                </span>
              );
            })
          ) : (
            (() => {
              const allWords = caption.text.split(/\s+/).filter(Boolean);
              const totalDuration = caption.end - caption.start;
              const timePerWord = totalDuration / Math.max(1, allWords.length);

              return allWords.map((w, i) => {
                const estimatedWordStart = caption.start + (i * timePerWord);
                const wordStartFrame = Math.round((estimatedWordStart - caption.start) * fps);
                const wordElapsedFrames = frame - wordStartFrame;
                let wordOpacity = 0;
                let wordTransform = 'scale(0.8)';

                if (wordElapsedFrames >= 0) {
                  const progress = Math.min(1, wordElapsedFrames / 4);
                  wordOpacity = progress;
                  wordTransform = `scale(${0.8 + 0.2 * progress})`;
                }

                return (
                  <span
                    key={i}
                    style={{
                      marginRight: '0.25em',
                      display: 'inline-block',
                      opacity: wordOpacity,
                      transform: wordTransform,
                      transformOrigin: 'center center',
                      color: style.color
                    }}
                  >
                    {w}
                  </span>
                );
              });
            })()
          )}
        </div>
      ) : style.animation === 'karaoke' && caption.words && caption.words.length > 0 ? (
        <WordHighlight words={caption.words} style={style} />
      ) : (
        <span style={{ color: style.color }}>{displayText}</span>
      )}
    </div>
  );
};

function getAnimationStyle(
  animation: CaptionStyle['animation'],
  frame: number,
  totalDuration: number
): { transform?: string; opacity: number } {
  const inDuration = 8;

  switch (animation) {
    case 'pop': {
      const scale = interpolate(frame, [0, inDuration], [0.6, 1], {
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.back(2)),
      });
      return { transform: `scale(${scale})`, opacity: 1 };
    }
    case 'fade': {
      const opacity = interpolate(frame, [0, inDuration], [0, 1], {
        extrapolateRight: 'clamp',
      });
      return { opacity };
    }
    case 'slide-up': {
      const translateY = interpolate(frame, [0, inDuration], [20, 0], {
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      });
      return { transform: `translateY(${translateY}px)`, opacity: 1 };
    }
    case 'zoom': {
      const scale = interpolate(frame, [0, inDuration], [0, 1], {
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.quad),
      });
      return { transform: `scale(${scale})`, opacity: 1 };
    }
    case 'bounce': {
      const translateY = interpolate(frame, [0, 6, 12, 18, 24], [0, -18, 0, -6, 0], {
        extrapolateRight: 'clamp',
      });
      return { transform: `translateY(${translateY}px)`, opacity: 1 };
    }
    case 'shake': {
      const translateX = frame < 12 ? Math.sin(frame * 1.5) * 6 * (1 - frame / 12) : 0;
      return { transform: `translateX(${translateX}px)`, opacity: 1 };
    }
    case 'typewriter':
    case 'karaoke':
    case 'none':
    default:
      return { opacity: 1 };
  }
}