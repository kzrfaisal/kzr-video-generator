import fs from 'fs';
import path from 'path';
import { projectPath, scriptPath } from '@/src/shared/filesystem/paths';
import { normalizeContentMode } from '@/src/features/projects/contentMode';
import { reconcileScenes, scriptToLegacyText } from '@/src/domain/projects/script';
import {
  PROJECT_SCHEMA_VERSION,
  type ContentMode,
  type ProjectDocument,
  type ScriptScene,
} from '@/src/domain/projects/types';

type LegacyProjectRecord = {
  topic?: unknown;
  title?: unknown;
  context?: unknown;
  config?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStructuredProject(value: unknown): value is ProjectDocument {
  return isRecord(value)
    && value.schemaVersion === PROJECT_SCHEMA_VERSION
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.context === 'string'
    && Array.isArray(value.scenes)
    && isRecord(value.config);
}

function validateScenes(scenes: ScriptScene[], contentMode: ContentMode): ScriptScene[] {
  const ids = new Set<string>();
  for (const [index, scene] of scenes.entries()) {
    if (!scene || typeof scene !== 'object') throw new Error(`Invalid scene ${index + 1}.`);
    if (!scene.id || ids.has(scene.id)) throw new Error(`Scene ${index + 1} has a missing or duplicate ID.`);
    if (!['HOST', 'A', 'B'].includes(scene.speaker)) throw new Error(`Scene ${scene.id} has an invalid speaker.`);
    if (contentMode === 'narrated-explainer' && scene.speaker !== 'HOST') {
      throw new Error(`Scene ${scene.id} uses ${scene.speaker}; explainers must use HOST.`);
    }
    if (!scene.narration?.trim()) throw new Error(`Scene ${scene.id} has no narration.`);
    ids.add(scene.id);
  }
  return scenes;
}

function fileTimestamp(name: string): string {
  for (const file of [projectPath(name), scriptPath(name)]) {
    try { return fs.statSync(file).birthtime.toISOString(); }
    catch { /* try the next source */ }
  }
  return new Date().toISOString();
}

function legacyToDocument(name: string, record: LegacyProjectRecord): ProjectDocument {
  const config = isRecord(record.config) ? record.config : {};
  const contentMode = normalizeContentMode(config.contentMode);
  const legacyScript = fs.existsSync(scriptPath(name)) ? fs.readFileSync(scriptPath(name), 'utf-8') : '';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : fileTimestamp(name);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: name,
    title: typeof record.title === 'string'
      ? record.title
      : typeof record.topic === 'string' ? record.topic : name,
    context: typeof record.context === 'string' ? record.context : '',
    contentMode,
    scenes: legacyScript.trim() ? reconcileScenes(legacyScript, contentMode) : [],
    metadata: null,
    config: { ...config, contentMode },
    createdAt,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : createdAt,
  };
}

export function createProjectDocument(input: {
  id: string;
  title: string;
  context?: string;
  contentMode: ContentMode;
  script: string;
  config?: Record<string, unknown>;
}): ProjectDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.id,
    title: input.title.trim(),
    context: input.context?.trim() ?? '',
    contentMode: input.contentMode,
    scenes: reconcileScenes(input.script, input.contentMode),
    metadata: null,
    config: { ...(input.config ?? {}), contentMode: input.contentMode },
    createdAt: now,
    updatedAt: now,
  };
}

/** Read both new documents and old `{ topic, context, config }` sidecars. */
export function readProjectDocument(name: string): ProjectDocument {
  const file = projectPath(name);
  if (!fs.existsSync(file)) throw new Error(`Project not found: ${name}`);
  const raw = readJson(file);
  if (!isStructuredProject(raw)) return legacyToDocument(name, isRecord(raw) ? raw : {});
  const contentMode = normalizeContentMode(raw.contentMode ?? raw.config.contentMode);
  return {
    ...raw,
    id: name,
    contentMode,
    config: { ...raw.config, contentMode },
    scenes: validateScenes(raw.scenes, contentMode),
  };
}

/** Persist JSON first, then refresh the optional text compatibility export. */
export function saveProjectDocument(project: ProjectDocument, writeTextExport = true): ProjectDocument {
  const contentMode = normalizeContentMode(project.contentMode);
  const next: ProjectDocument = {
    ...project,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    contentMode,
    config: { ...project.config, contentMode },
    scenes: validateScenes(project.scenes, contentMode),
    updatedAt: new Date().toISOString(),
  };
  const file = projectPath(next.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', 'utf-8');
  fs.renameSync(temporary, file);
  if (writeTextExport) fs.writeFileSync(scriptPath(next.id), scriptToLegacyText(next.scenes), 'utf-8');
  return next;
}

export function readProjectScriptText(name: string): string {
  return scriptToLegacyText(readProjectDocument(name).scenes);
}

export function updateProjectScriptFromText(name: string, script: string): ProjectDocument {
  const project = readProjectDocument(name);
  project.scenes = reconcileScenes(script, project.contentMode, project.scenes);
  return saveProjectDocument(project);
}

/** Explicitly upgrades a legacy sidecar without touching generated media. */
export function migrateProjectDocument(name: string): ProjectDocument {
  return saveProjectDocument(readProjectDocument(name));
}
