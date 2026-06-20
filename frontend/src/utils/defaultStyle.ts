import type { CaptionStyle } from '../types';
import presets from './presets.json';

/** Returns a copy of the first preset, used as the default style for new captions. */
export function createDefaultCaptionStyle(): CaptionStyle {
  const first = (presets as { style: CaptionStyle }[])[0];
  return JSON.parse(JSON.stringify(first.style));
}
