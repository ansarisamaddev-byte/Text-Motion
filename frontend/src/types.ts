export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface CaptionWord {
  text: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface CaptionStyle {
  presetId?: string;
  fontFamily: string;
  fontSize: number; // px inside resolution space
  color: string;    // hex
  backgroundColor: RGBA;
  borderRadius: number;
  position: {
    x: 'left' | 'center' | 'right' | number;
    y: number; // percentage from top
  };
  animation: 'none' | 'pop' | 'fade' | 'slide-up' | 'karaoke';
  fontWeight?: string;
  textAlign?: string;
  highlightColor?: string;
  highlightWords?: string[];
  wordByWord?: boolean;
}

export interface Caption {
  id: string;
  text: string;
  start: number;
  end: number;
  words?: CaptionWord[];
  style: CaptionStyle;
}

export interface FilterType {
  id: string;
  type: 'grayscale' | 'sepia' | 'vintage' | 'contrast' | 'brightness' | 'none';
  intensity: number;
  start: number;
  end: number;
}

export interface FilterClip {
  id: string;
  type: 'grayscale' | 'sepia' | 'vintage' | 'contrast' | 'brightness' | 'none';
  intensity: number;
  start: number;
  end: number;
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
  start: number;
  end: number;
  animation?: 'none' | 'fade' | 'pop' | 'slide-up' | 'bounce' | 'zoom' | 'shake';
  initialX?: number;
  initialY?: number;
  initialWidth?: number;
  initialHeight?: number;
  initialRotation?: number;
  finalX?: number;
  finalY?: number;
  finalWidth?: number;
  finalHeight?: number;
  finalRotation?: number;
  motionEasing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce';
}

export interface Project {
  id?: string;
  name: string;
  videoSrc: string;
  durationFrames: number; // Aligned perfectly with backend parameter keys
  fps: number;
  resolution: { width: number; height: number };
  videoTracks: any[];
  audioTracks: any[];
  captions: Caption[];
  overlays: StickerOverlay[];
  filters: FilterClip[];
}

export const createEmptyProject = (): Project => ({
  id: crypto.randomUUID(),
  name: 'Untitled Project',
  videoSrc: '',
  durationFrames: 30 * 10, // Default fallback context
  fps: 30,
  resolution: { width: 1080, height: 1920 },
  videoTracks: [],
  audioTracks: [],
  captions: [],
  overlays: [],
  filters: []
});