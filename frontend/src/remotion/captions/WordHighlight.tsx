import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionWord, CaptionStyle } from '../../types';

interface WordHighlightProps {
  words: CaptionWord[];
  style: CaptionStyle;
}

/**
 * Renders caption text word-by-word, highlighting the word that is
 * "active" at the current frame. Used for karaoke-style captions.
 *
 * Works purely off frame number + fps, so it renders identically in the
 * <Player> preview and in the headless-Chromium final render.
 */
export const WordHighlight: React.FC<WordHighlightProps> = ({ words, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  return (
    <>
      {words.map((word, i) => {
        const isActive = currentTime >= word.start && currentTime <= word.end;
        const isHighlighted =
          isActive ||
          (style.highlightWords && style.highlightWords.includes(word.text));

        return (
          <span
            key={i}
            style={{
              color: isHighlighted ? style.highlightColor || style.color : style.color,
              transition: 'color 0.05s linear',
              marginRight: '0.3em',
              display: 'inline-block',
            }}
          >
            {word.text}
          </span>
        );
      })}
    </>
  );
};
