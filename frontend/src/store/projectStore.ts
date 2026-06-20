import { create } from 'zustand';
import type { Project, Caption, FilterClip, StickerOverlay, CaptionStyle } from '../types';
import { createEmptyProject } from '../types';

interface ProjectState {
  project: Project;
  selectedCaptionId: string | null;
  
  // Method signature
  getActiveProjectId: () => string;
  
  setProject: (project: Project) => void;
  setVideoSrc: (src: string, durationFrames: number, fps: number, width: number, height: number) => void;

  addCaption: (caption: Caption) => void;
  updateCaptionStyle: (id: string, style: Partial<CaptionStyle>) => void;
  applyPresetToCaption: (id: string, preset: CaptionStyle) => void;
  removeCaption: (id: string) => void;
  selectCaption: (id: string | null) => void;

  addFilter: (filter: FilterClip) => void;
  updateFilter: (id: string, changes: Partial<FilterClip>) => void;
  removeFilter: (id: string) => void;

  addSticker: (sticker: StickerOverlay) => void;
  updateSticker: (id: string, changes: Partial<StickerOverlay>) => void;
  removeSticker: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: createEmptyProject(),
  selectedCaptionId: null,

  // Use 'get' here to access the current state
  getActiveProjectId: () => get().project.id,

  setProject: (project) => set({ project }),

  setVideoSrc: (src, durationInFrames, fps, width, height) =>
  set((state) => ({
    project: {
      ...state.project,
      videoSrc: src,
      // Fix #1: Adhere strictly to the types.ts definition
      durationFrames: durationInFrames, 
      fps: fps || 30,
      // Fix #2: Correctly nest the width and height into the resolution object
      resolution: {
        width: width || 720,
        height: height || 1280
      }
    }
  })),

  addCaption: (caption) =>
    set((state) => ({ project: { ...state.project, captions: [...state.project.captions, caption] } })),

  updateCaptionStyle: (id, styleChanges) =>
    set((state) => ({
      project: {
        ...state.project,
        captions: state.project.captions.map((c) =>
          c.id === id ? { ...c, style: { ...c.style, ...styleChanges } } : c
        ),
      },
    })),

  applyPresetToCaption: (id, preset) =>
    set((state) => ({
      project: {
        ...state.project,
        captions: state.project.captions.map((c) =>
          c.id === id ? { ...c, style: { ...preset } } : c
        ),
      },
    })),

  removeCaption: (id) =>
    set((state) => ({
      project: { ...state.project, captions: state.project.captions.filter((c) => c.id !== id) },
      selectedCaptionId: state.selectedCaptionId === id ? null : state.selectedCaptionId,
    })),

  selectCaption: (id) => set({ selectedCaptionId: id }),

  addFilter: (filter) =>
    set((state) => ({ project: { ...state.project, filters: [...state.project.filters, filter] } })),

  updateFilter: (id, changes) =>
    set((state) => ({
      project: {
        ...state.project,
        filters: state.project.filters.map((f) => (f.id === id ? { ...f, ...changes } : f)),
      },
    })),

  removeFilter: (id) =>
    set((state) => ({
      project: { ...state.project, filters: state.project.filters.filter((f) => f.id !== id) },
    })),

  addSticker: (sticker) =>
    set((state) => ({ project: { ...state.project, overlays: [...state.project.overlays, sticker] } })),

  updateSticker: (id, changes) =>
    set((state) => ({
      project: {
        ...state.project,
        overlays: state.project.overlays.map((o) => (o.id === id ? { ...o, ...changes } : o)),
      },
    })),

  removeSticker: (id) =>
    set((state) => ({
      project: { ...state.project, overlays: state.project.overlays.filter((o) => o.id !== id) },
    })),
}));