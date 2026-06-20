import React from 'react';
import { AbsoluteFill, OffthreadVideo } from 'remotion';

interface VideoLayerProps {
  videoSrc: string | null;
  volume?: number;
}

export const VideoLayer: React.FC<VideoLayerProps> = ({ videoSrc, volume = 1 }) => {
  if (!videoSrc) {
    console.warn('[Remotion] VideoLayer rendering skipped: videoSrc is null or undefined.');
    return null;
  }

  // Defensive check for production URLs
  if (typeof window !== 'undefined' && !videoSrc.startsWith('https://')) {
    console.error(
      `[Remotion Layout Warning] videoSrc "${videoSrc}" is not a secure public URL.`
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      <OffthreadVideo
        src={videoSrc}
        volume={volume} // Pass the volume prop directly to OffthreadVideo
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
      {/* <Audio /> removed: OffthreadVideo handles the audio track automatically */}
    </AbsoluteFill>
  );
};