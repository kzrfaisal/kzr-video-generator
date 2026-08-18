import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { config } from '@/config';
import { ensureDir, type DebateLine, withRetry } from '@/src/shared/utils';
import {
  reelsPartsPath,
  visualCreditsPath,
  visualPlanPath,
  visualSceneImagePath,
} from '@/src/shared/filesystem/paths';
import { readContentMode } from '@/src/features/projects/contentMode';
import { readProjectDocument, saveProjectDocument } from '@/src/infrastructure/storage/localProjectStore';
import { scenesToDialogue } from '@/src/domain/projects/script';
import { GeneratedVisualPlanSchema } from '@/src/services/openai/schemas';
import { generateStructured } from '@/src/services/openai/structuredOutput';
import { VISUAL_PROMPT_VERSION, visualDeveloperPrompt, visualUserPrompt } from '@/src/services/openai/prompts';

const LINES_PER_SCENE = 3;

export interface VisualSource {
  provider: 'pexels';
  photoId: number;
  photographer: string;
  photographerUrl: string;
  photoUrl: string;
  alt: string;
}

export interface VisualScene {
  id: string;
  scriptSceneIds?: string[];
  lineStart: number;
  lineEnd: number;
  speaker: string;
  headline: string;
  searchQuery: string;
  selectionIndex: number;
  imagePath?: string;
  source?: VisualSource;
  error?: string;
}

export interface VisualPlan {
  version: 1;
  debateName: string;
  provider: 'pexels';
  createdAt: string;
  scenes: VisualScene[];
}

interface SceneGroup {
  id: string;
  scriptSceneIds: string[];
  lineStart: number;
  lineEnd: number;
  speaker: string;
  text: string;
}

interface PexelsPhoto {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt?: string;
  src: { original: string; landscape?: string; large2x?: string; large?: string };
}

function groupLines(lines: DebateLine[], sceneIds: string[]): SceneGroup[] {
  const groups: SceneGroup[] = [];
  for (let start = 0; start < lines.length; start += LINES_PER_SCENE) {
    const slice = lines.slice(start, start + LINES_PER_SCENE);
    const scriptSceneIds = slice.map((_, offset) => sceneIds[start + offset]).filter(Boolean);
    groups.push({
      id: scriptSceneIds[0] ? `visual-${scriptSceneIds[0]}` : `scene-${String(groups.length + 1).padStart(2, '0')}`,
      scriptSceneIds,
      lineStart: start,
      lineEnd: start + slice.length - 1,
      speaker: slice[0]?.speaker ?? 'HOST',
      text: slice.map(line => line.text).join(' '),
    });
  }
  return groups;
}

function fallbackQuery(topic: string, text: string): string {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const useful = words.filter(word => word.length > 4).slice(0, 4);
  return [...useful, ...topic.split(/\s+/).slice(0, 3)].slice(0, 6).join(' ') || 'people discussion';
}

async function createPlanCopy(
  topic: string,
  context: string,
  groups: SceneGroup[],
  narrated: boolean,
): Promise<{ scenes: Array<{ headline: string; searchQuery: string }>; responseId: string }> {
  const compact = groups.map(group => ({ id: group.id, narration: group.text }));
  const generated = await generateStructured({
    model: config.scriptModel,
    schema: GeneratedVisualPlanSchema,
    schemaName: 'visual_plan',
    developerPrompt: visualDeveloperPrompt(narrated),
    userPrompt: visualUserPrompt({ title: topic, context, scenes: compact }),
    label: 'visual scene plan',
  });
  if (generated.data.scenes.length !== groups.length) {
    throw new Error('Visual planner returned the wrong number of scenes.');
  }
  const scenes = groups.map((group, index) => {
    const planned = generated.data.scenes[index];
    if (planned.id !== group.id) throw new Error(`Visual planner changed scene ID ${group.id}.`);
    return {
      headline: planned.headline.trim(),
      searchQuery: planned.searchQuery.trim(),
    };
  });
  return { scenes, responseId: generated.responseId };
}

function pexelsKey(): string {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) throw new Error('PEXELS_API_KEY is missing. Add a free Pexels API key to .env.');
  return key;
}

async function searchPexels(query: string): Promise<PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('size', 'large');
  url.searchParams.set('per_page', '12');
  const response = await withRetry(() => fetch(url, {
    headers: { Authorization: pexelsKey() },
  }).then(async result => {
    if (!result.ok) throw Object.assign(new Error(`Pexels search failed (${result.status}): ${await result.text()}`), { status: result.status });
    return result;
  }), 'Pexels search');
  const data = await response.json() as { photos?: PexelsPhoto[] };
  return data.photos ?? [];
}

function sizedPhotoUrl(photo: PexelsPhoto): string {
  const raw = photo.src.original || photo.src.large2x || photo.src.landscape || photo.src.large;
  if (!raw) throw new Error('Pexels photo has no downloadable source URL.');
  const url = new URL(raw);
  url.searchParams.set('auto', 'compress');
  url.searchParams.set('cs', 'tinysrgb');
  url.searchParams.set('w', '1920');
  return url.toString();
}

async function downloadPhoto(photo: PexelsPhoto, target: string): Promise<void> {
  const response = await withRetry(() => fetch(sizedPhotoUrl(photo)).then(result => {
    if (!result.ok) throw Object.assign(new Error(`Pexels image download failed (${result.status}).`), { status: result.status });
    return result;
  }), 'Pexels image');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) throw new Error(`Pexels returned ${contentType || 'non-image content'}.`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

async function attachPhoto(debateName: string, scene: VisualScene): Promise<void> {
  let photos = await searchPexels(scene.searchQuery);
  if (photos.length === 0) {
    try {
      const project = readProjectDocument(debateName);
      photos = await searchPexels((project.title || 'people discussion').slice(0, 100));
    } catch { /* keep the original no-results error below */ }
  }
  if (photos.length === 0) throw new Error(`No Pexels photos found for “${scene.searchQuery}”.`);
  const photo = photos[scene.selectionIndex % photos.length];
  const target = visualSceneImagePath(debateName, scene.id);
  ensureDir(path.dirname(target));
  await downloadPhoto(photo, target);
  scene.imagePath = target;
  scene.source = {
    provider: 'pexels',
    photoId: photo.id,
    photographer: photo.photographer,
    photographerUrl: photo.photographer_url,
    photoUrl: photo.url,
    alt: photo.alt ?? '',
  };
  delete scene.error;
}

function savePlan(plan: VisualPlan): void {
  ensureDir(path.dirname(visualPlanPath(plan.debateName)));
  fs.writeFileSync(visualPlanPath(plan.debateName), JSON.stringify(plan, null, 2), 'utf-8');
  ensureDir(path.dirname(visualCreditsPath(plan.debateName)));
  const credits = [
    'Visuals provided by Pexels: https://www.pexels.com',
    '',
    ...plan.scenes.flatMap(scene => scene.source
      ? [`${scene.id}: Photo by ${scene.source.photographer}`, scene.source.photoUrl, scene.source.photographerUrl, '']
      : []),
  ];
  fs.writeFileSync(visualCreditsPath(plan.debateName), credits.join('\n'), 'utf-8');
}

function syncPlanToProject(plan: VisualPlan): void {
  const project = readProjectDocument(plan.debateName);
  for (const visual of plan.scenes) {
    const ids = new Set(visual.scriptSceneIds ?? project.scenes
      .slice(visual.lineStart, visual.lineEnd + 1)
      .map(scene => scene.id));
    project.scenes = project.scenes.map(scene => {
      if (!ids.has(scene.id)) return scene;
      const overlayId = `${scene.id}-headline`;
      const overlays = scene.overlays.filter(overlay => overlay.id !== overlayId);
      if (visual.headline) overlays.push({ id: overlayId, type: 'headline', text: visual.headline });
      return {
        ...scene,
        headline: visual.headline,
        visualQuery: visual.searchQuery,
        visualType: 'stock-photo',
        visualAssetPath: visual.imagePath ?? null,
        overlays,
        status: visual.error ? 'failed' : visual.imagePath ? 'ready' : 'draft',
      };
    });
  }
  saveProjectDocument(project);
}

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export async function generateVisualScenes(debateName: string): Promise<VisualPlan> {
  pexelsKey(); // Fail before spending a model call.
  const project = readProjectDocument(debateName);
  const narrated = readContentMode(debateName) === 'narrated-explainer';
  const lines = scenesToDialogue(project.scenes);
  const groups = groupLines(lines, project.scenes.map(scene => scene.id));
  let copy: Array<{ headline: string; searchQuery: string }>;
  let visualResponseId: string | null = null;
  try {
    const generatedCopy = await createPlanCopy(project.title || debateName, project.context, groups, narrated);
    copy = generatedCopy.scenes;
    visualResponseId = generatedCopy.responseId;
  } catch (error) {
    console.warn(`Visual copy planning failed; using local fallback: ${error instanceof Error ? error.message : error}`);
    copy = groups.map(group => ({ headline: 'Key point', searchQuery: fallbackQuery(project.title, group.text) }));
  }
  const generation = typeof project.config.generation === 'object' && project.config.generation !== null
    ? project.config.generation as Record<string, unknown>
    : {};
  project.config.generation = {
    ...generation,
    visualPromptVersion: VISUAL_PROMPT_VERSION,
    ...(visualResponseId ? { visualResponseId } : {}),
  };
  saveProjectDocument(project);

  const plan: VisualPlan = {
    version: 1,
    debateName,
    provider: 'pexels',
    createdAt: new Date().toISOString(),
    scenes: groups.map((group, index) => ({
      id: group.id,
      scriptSceneIds: group.scriptSceneIds,
      lineStart: group.lineStart,
      lineEnd: group.lineEnd,
      speaker: group.speaker,
      headline: copy[index].headline,
      searchQuery: copy[index].searchQuery,
      selectionIndex: 0,
    })),
  };

  await mapWithConcurrency(plan.scenes, 3, async scene => {
    try { await attachPhoto(debateName, scene); }
    catch (error) { scene.error = error instanceof Error ? error.message : 'Image search failed.'; }
    savePlan(plan);
  });
  savePlan(plan);
  syncPlanToProject(plan);
  const missing = plan.scenes.filter(scene => !scene.imagePath);
  if (missing.length > 0) {
    throw new Error(`${missing.length} visual scene${missing.length === 1 ? '' : 's'} could not be downloaded. Review and replace the missing scenes.`);
  }
  return plan;
}

export function readVisualPlan(debateName: string): VisualPlan | null {
  const file = visualPlanPath(debateName);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) as VisualPlan; }
  catch { return null; }
}

export async function regenerateVisualScene(debateName: string, sceneId: string, query?: string): Promise<VisualScene> {
  pexelsKey();
  const plan = readVisualPlan(debateName);
  if (!plan) throw new Error('Generate visual scenes first.');
  const scene = plan.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('Visual scene not found.');
  const nextQuery = query?.trim().slice(0, 100);
  if (nextQuery && nextQuery !== scene.searchQuery) {
    scene.searchQuery = nextQuery;
    scene.selectionIndex = 0;
  } else {
    scene.selectionIndex += 1;
  }
  await attachPhoto(debateName, scene);
  savePlan(plan);
  syncPlanToProject(plan);
  return scene;
}

function originalLineIndex(debateName: string, lineIndex: number): number {
  const base = debateName.split('/').pop() ?? debateName;
  const match = base.match(/^(.+)_part(\d+)$/);
  if (!match) return lineIndex;
  const [, parent, part] = match;
  try {
    const parts = JSON.parse(fs.readFileSync(reelsPartsPath(parent), 'utf-8')) as Array<{ name: string; origLineIndices: number[] }>;
    const current = parts.find(item => item.name === `${parent}_part${part}`);
    return current?.origLineIndices[lineIndex] ?? current?.origLineIndices.at(-1) ?? lineIndex;
  } catch {
    return lineIndex;
  }
}

export function visualSceneForLine(debateName: string, lineIndex: number): VisualScene | null {
  const parent = (debateName.split('/').pop() ?? debateName).replace(/_part\d+$/, '');
  const plan = readVisualPlan(parent);
  if (!plan) return null;
  const original = originalLineIndex(debateName, lineIndex);
  return plan.scenes.find(scene => original >= scene.lineStart && original <= scene.lineEnd) ?? null;
}
