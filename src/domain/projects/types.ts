export const PROJECT_SCHEMA_VERSION = 1 as const;

export type ContentMode = 'debate' | 'narrated-explainer';
export type SpeakerRole = 'HOST' | 'A' | 'B';
export type SceneVisualType = 'stock-photo' | 'character' | 'generated-image' | 'none';
export type SceneStatus = 'draft' | 'ready' | 'generating' | 'failed';

export interface SceneOverlay {
  id: string;
  type: 'headline' | 'label' | 'fact';
  text: string;
}

/** A scene is the stable, editable unit consumed by audio, visuals, and rendering. */
export interface ScriptScene {
  id: string;
  speaker: SpeakerRole;
  narration: string;
  headline: string;
  visualQuery: string;
  visualType: SceneVisualType;
  visualAssetPath: string | null;
  durationHintSeconds: number | null;
  overlays: SceneOverlay[];
  status: SceneStatus;
}

export interface ProjectMetadata {
  youtube: {
    title: string;
    description: string;
    hashtags: string[];
  };
  reels: Array<{
    part: 1 | 2 | 3;
    caption: string;
  }>;
  thumbnailHook: string;
}

/**
 * Versioned source of truth for a locally stored project.
 *
 * `config` remains deliberately open during the migration because the current renderer
 * has several style-specific settings. It will receive its own schema in the pipeline
 * reliability step.
 */
export interface ProjectDocument {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  title: string;
  context: string;
  contentMode: ContentMode;
  scenes: ScriptScene[];
  metadata: ProjectMetadata | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
