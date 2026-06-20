export interface VideoTrack {
  id: string;
  src: string;
  startFrame: number;
  durationFrames: number;
  trimStartFrame: number;
  volume: number;
  speed: number;
  isPip?: boolean;
}

export interface AudioTrack {
  id: string;
  src: string;
  startFrame: number;
  durationFrames: number;
  trimStartFrame: number;
  volume: number;
}

export interface StickerOverlay {
  id: string;
  type: 'sticker';
  assetUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  start: number; // in seconds
  end: number;   // in seconds
  animation?: 'none' | 'fade' | 'pop' | 'slide-up' | 'bounce' | 'zoom' | 'shake';
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface Caption {
  id: string;
  text: string;
  start: number; // in seconds
  end: number;   // in seconds
  words?: CaptionWord[];
  style: any;
}

export interface FilterClip {
  id: string;
  type: 'grayscale' | 'sepia' | 'vintage' | 'contrast' | 'brightness' | 'none';
  intensity: number;
  start: number;
  end: number;
}

export interface Project {
  id?: string;
  name: string;
  videoSrc: string; // Base video source track URL
  durationFrames: number;
  fps: number;
  resolution: { width: number; height: number };
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  captions: Caption[];
  overlays: StickerOverlay[];
  filters: FilterClip[];
}