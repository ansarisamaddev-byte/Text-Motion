import React from 'react';
import { Composition } from 'remotion';
import { MainComposition } from './MainComposition';
import { createEmptyProject, type Project } from '../types';
import { loadFont } from "@remotion/google-fonts/Poppins";
export const RemotionRoot: React.FC = () => {
  const defaultProject: Project = createEmptyProject();
  loadFont();
  return (
    <Composition
      id="MainComposition"
      component={MainComposition}
      durationInFrames={252}
      fps={30}
      width={720}
      height={1280}
      defaultProps={{ project: defaultProject }}
      calculateMetadata={({ props }) => {
        const project = props?.project || props || {};
        // Map perfectly to the corrected store configuration structure
        const duration = project.durationFrames || props.durationFrames || 252;
        const fps = project.fps || props.fps || 30;
        const width = project.resolution?.width || project.width || 720;
        const height = project.resolution?.height || project.height || 1280;

        return {
          durationInFrames: duration,
          fps,
          width,
          height,
        };
      }}
    />
  );
};
