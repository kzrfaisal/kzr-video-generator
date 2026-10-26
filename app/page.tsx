'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { BrandMark } from './components/BrandMark';

interface ReelScript { part: number; script: string; }

interface ScriptScene {
  id: string;
  sectionId?: string;
  speaker: 'HOST' | 'A' | 'B';
  narration: string;
  headline: string;
  visualQuery: string;
  visualType: 'stock-photo' | 'character' | 'generated-image' | 'none';
  visualAssetPath: string | null;
  durationHintSeconds: number | null;
  overlays: Array<{ id: string; type: 'headline' | 'label' | 'fact'; text: string }>;
  status: 'draft' | 'ready' | 'generating' | 'failed';
}

interface VisualScene {
  id: string;
  scriptSceneIds?: string[];
  lineStart?: number;
  lineEnd?: number;
  headline: string;
  searchQuery: string;
  imagePath?: string;
  error?: string;
  source?: {
    photographer: string;
    photographerUrl: string;
    photoUrl: string;
  };
}

interface AudioSegment {
  number: number;
  sourceLineIndex: number;
  speaker: string;
  text: string;
  durationSeconds: number;
  url: string;
}

interface CustomSubtitle {
  position?: string;
  font?: string;
  fontsize?: number;
  fontcolor?: string;
  bordercolor?: string;
  borderw?: number;
  margin?: number;
}

interface RunConfig {
  contentMode: 'debate' | 'narrated-explainer';
  visualMode: 'debate' | 'infographic';
  visualPacing: 'relaxed' | 'balanced' | 'detailed';
  outputType: 'youtube' | 'short';
  videoLengthMinutes: number;
  extractReels: boolean;
  thumbnailHook: string;
  voices: { HOST: string; A: string; B: string };
  ttsModel: string;
  ttsSpeed: number;
  subtitlesEnabled: boolean;
  sceneTitlesEnabled: boolean;
  sceneTitleMode: 'intro' | 'persistent' | 'hidden';
  subtitleStyle: string;
  videoStyle: string;
  customSubtitle?: CustomSubtitle;
}

interface Options {
  voices: string[];
  ttsModels: string[];
  subtitleStyles: string[];
  videoStyles: string[];
  fonts: { label: string; value: string }[];
  positions: string[];
}

interface PublishState {
  status: 'publishing' | 'complete' | 'error';
  youtube: {
    main?: { videoId: string; url: string; publishedAt: string };
    shorts: Array<{ part: number; videoId: string; url: string; publishedAt: string }>;
  };
  instagram?: Array<{ part: number; mediaId: string; url?: string; publishedAt: string }>;
  error?: string;
}

interface PublishingCredentialStatus {
  configured: boolean;
  valid: boolean | null;
  tokenExpiresAt: string | null;
  dataAccessExpiresAt?: string | null;
  message: string;
}

interface PublishingReadiness {
  ready: boolean;
  missing: string[];
  platforms: {
    youtube: PublishingCredentialStatus | null;
    instagram: PublishingCredentialStatus | null;
  };
}

interface UsageNumbers {
  calls?: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  characters: number;
  costUsd: number;
  costInr: number;
}

interface UsageCall extends UsageNumbers {
  id: string;
  createdAt: string;
  projectId?: string;
  projectTitle?: string;
  operation: string;
  model: string;
}

interface UsageSummary {
  total: UsageNumbers & { calls: number };
  lastCall: UsageCall | null;
  usdToInr: number;
  exchangeRateAsOf: string;
}

interface ProjectUsageGroup {
  id: string;
  title: string;
  calls: UsageCall[];
  totalTokens: number;
  characters: number;
  costUsd: number;
  costInr: number;
  lastActivityAt: string;
}

interface ProjectMetadata {
  youtube: { title: string; description: string; hashtags: string[] };
  reels: Array<{ part: number; caption: string }>;
  thumbnailHook: string;
}

interface Debate {
  debateName: string;
  topic: string;
  context: string;
  script: string;
  scenes: ScriptScene[];
  metadata: string | null;
  metadataFields: ProjectMetadata | null;
  config: Partial<RunConfig> | null;
  thumbnailExists: boolean;
  audioExists: boolean;
  videoExists: boolean;
  reelScripts: ReelScript[];
  reelsCount: number;
  reelsTargetCount: number;
  publishing: PublishState | null;
}

type PublishTarget = 'youtube' | 'instagram' | 'all';
type Theme = 'light' | 'dark';
type WorkspaceSection = 'setup' | 'storyboard' | 'visuals' | 'video' | 'publish';
type ReviewTab = 'script' | 'metadata';
type MetadataPlatform = 'youtube' | 'reels';
type HomeView = 'projects' | 'create' | 'logs';
type ProjectFilter = 'all' | 'draft' | 'generating' | 'ready';
type GeneratePlanSource = 'create' | 'script' | 'visuals';
type GeneratePlanStage = 'script' | 'metadata' | 'visuals' | 'thumbnail' | 'audio' | 'video' | 'shorts' | 'publish';
type JobKind = 'visuals' | 'audio' | 'video' | 'reels' | 'publish' | 'publish-youtube' | 'publish-instagram';
interface JobView { id: string; kind: JobKind; stage: string; status: string; attempt?: number; logs?: string[]; error?: string; }

interface ProjectSummary {
  debateName: string;
  topic: string;
  updatedAt: number;
  contentMode: 'debate' | 'narrated-explainer';
  scenesCount: number;
  thumbnailExists: boolean;
  audioExists: boolean;
  videoExists: boolean;
  reelsCount: number;
  reelsTargetCount: number;
}

// Reviewed generation pauses after the script, metadata, and reel scripts.
type AutoStep = null | 'awaiting-script' | 'awaiting-metadata' | 'awaiting-visuals' | 'running' | 'awaiting-reels';

const LS_KEY = 'activeDebate';
const THEME_KEY = 'kzr-theme';
const CREATION_DRAFT_KEY = 'kzr-creation-draft';
const REEL_DURATION_SECONDS = 52;
const REEL_DURATION_MINUTES = REEL_DURATION_SECONDS / 60;
const DEFAULT_CFG: RunConfig = {
  contentMode: 'narrated-explainer',
  visualMode: 'infographic',
  visualPacing: 'balanced',
  outputType: 'youtube',
  videoLengthMinutes: 3,
  extractReels: true,
  thumbnailHook: '',
  voices: { HOST: 'alloy', A: 'echo', B: 'ash' },
  ttsModel: 'tts-1',
  ttsSpeed: 1.0,
  subtitlesEnabled: true,
  sceneTitlesEnabled: true,
  sceneTitleMode: 'intro',
  subtitleStyle: 'top-classic',
  videoStyle: 'style1',
};
const DEFAULT_CUSTOM: CustomSubtitle = {
  position: 'top', font: '', fontsize: 44, fontcolor: 'white',
  bordercolor: 'black', borderw: 3, margin: 120,
};

function visualModeForContentMode(contentMode: RunConfig['contentMode']): RunConfig['visualMode'] {
  return contentMode === 'debate' ? 'debate' : 'infographic';
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      className="theme-toggle"
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      onClick={onToggle}
    >
      <Icon name="sun" size={15} />
      <span className="theme-toggle-track"><i /></span>
      <Icon name="moon" size={15} />
    </button>
  );
}

/** Drop empty/undefined fields (e.g. blank font → use the default) before sending. */
function cleanCustom(cs: CustomSubtitle): CustomSubtitle {
  const out: CustomSubtitle = {};
  for (const [k, v] of Object.entries(cs)) {
    if (v !== undefined && v !== '') (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

function formatProjectDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(timestamp);
}

function formatEditorTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatCredentialDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatLogDate(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function readableOperation(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatUsageMoney(value: number, currency: 'USD' | 'INR'): string {
  const symbol = currency === 'USD' ? '$' : '₹';
  if (value === 0) return `${symbol}0.00`;
  const digits = value < 0.01 ? 5 : value < 1 ? 3 : 2;
  return `${symbol}${value.toFixed(digits)}`;
}

function publishingAuthError(message: string): 'youtube' | 'instagram' | null {
  const normalized = message.toLowerCase();
  if (normalized.includes('youtube') && (normalized.includes('authoriz') || normalized.includes('token'))) {
    return 'youtube';
  }
  if ((normalized.includes('instagram') || normalized.includes('access token'))
    && (normalized.includes('expired') || normalized.includes('token') || normalized.includes('authoriz'))) {
    return 'instagram';
  }
  return null;
}

function sceneCountForLength(minutes: number, outputType: RunConfig['outputType']): number {
  return outputType === 'short' ? 2 : Math.max(2, Math.min(8, Math.round(minutes / 0.65)));
}

/** Add stable IDs to older projects and combine overly fragmented adjacent scenes. */
function normalizeScriptSectionIds(scenes: ScriptScene[], targetSceneCount?: number): ScriptScene[] {
  let nextNumber = scenes.reduce((highest, scene) => {
    const value = Number(scene.sectionId?.match(/\d+$/)?.[0] ?? 0);
    return Math.max(highest, value);
  }, 0) + 1;
  let currentSectionId = '';
  let currentSectionSize = 0;
  let previousHeadline: string | null = null;
  let normalized = scenes.map((scene, index) => {
    if (scene.sectionId) {
      currentSectionSize = scene.sectionId === currentSectionId ? currentSectionSize + 1 : 1;
      currentSectionId = scene.sectionId;
    } else if (index === 0 || scene.headline !== previousHeadline || !currentSectionId || currentSectionSize >= 4) {
      currentSectionId = `section-${String(nextNumber++).padStart(3, '0')}`;
      currentSectionSize = 1;
    } else currentSectionSize += 1;
    previousHeadline = scene.headline;
    return { ...scene, sectionId: currentSectionId };
  });

  if (!targetSceneCount) return normalized;
  const groups = () => {
    const result: ScriptScene[][] = [];
    for (const scene of normalized) {
      const previous = result.at(-1);
      if (previous?.[0].sectionId === scene.sectionId) previous.push(scene);
      else result.push([scene]);
    }
    return result;
  };
  let grouped = groups();
  while (grouped.length > targetSceneCount) {
    const candidates = grouped.slice(0, -1)
      .map((group, index) => ({ index, size: group.length + grouped[index + 1].length }))
      .filter(candidate => candidate.size <= 6)
      .sort((a, b) => a.size - b.size);
    if (candidates.length === 0) break;
    const first = grouped[candidates[0].index][0];
    const firstSectionId = first.sectionId!;
    const secondIds = new Set(grouped[candidates[0].index + 1].map(scene => scene.id));
    normalized = normalized.map(scene => secondIds.has(scene.id)
      ? { ...scene, sectionId: firstSectionId, headline: first.headline }
      : scene);
    grouped = groups();
  }
  return normalized;
}

function groupScriptScenes(scenes: ScriptScene[]) {
  const sections: Array<{ id: string; headline: string; scenes: ScriptScene[] }> = [];
  for (const scene of scenes) {
    const sectionId = scene.sectionId ?? scene.id;
    const previous = sections.at(-1);
    if (previous?.id === sectionId) previous.scenes.push(scene);
    else sections.push({ id: sectionId, headline: scene.headline, scenes: [scene] });
  }
  return sections;
}

function formatScriptDocument(scenes: ScriptScene[], contentMode: RunConfig['contentMode']): string {
  return groupScriptScenes(scenes).map((section, sectionIndex) => {
    const heading = `SCENE ${sectionIndex + 1} — ${section.headline || 'Untitled scene'}`;
    const lines = section.scenes.map(scene => contentMode === 'debate'
      ? `${scene.speaker}: ${scene.narration}`
      : scene.narration);
    return [heading, ...lines].join('\n');
  }).join('\n\n');
}

function parseScriptDocument(
  document: string,
  currentScenes: ScriptScene[],
  contentMode: RunConfig['contentMode'],
  visualMode: RunConfig['visualMode'],
): ScriptScene[] {
  const currentSections = groupScriptScenes(currentScenes);
  const parsed: Array<{ headline: string; lines: Array<{ speaker?: ScriptScene['speaker']; narration: string }> }> = [];
  let active: typeof parsed[number] | null = null;

  for (const rawLine of document.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^SCENE\s+\d+\s*(?:—|–|-|:)\s*(.*)$/i);
    if (heading) {
      active = { headline: heading[1]?.trim() || 'Untitled scene', lines: [] };
      parsed.push(active);
      continue;
    }
    if (!active) {
      active = { headline: currentSections[0]?.headline || 'Opening', lines: [] };
      parsed.push(active);
    }
    const speakerLine = line.match(/^(HOST|A|B)\s*:\s*(.*)$/i);
    active.lines.push({
      speaker: speakerLine ? speakerLine[1].toUpperCase() as ScriptScene['speaker'] : undefined,
      narration: speakerLine ? speakerLine[2].trim() : line,
    });
  }

  let nextSceneNumber = currentScenes.reduce((highest, scene) => Math.max(highest, Number(scene.id.match(/\d+$/)?.[0] ?? 0)), 0) + 1;
  let nextSectionNumber = currentScenes.reduce((highest, scene) => Math.max(highest, Number(scene.sectionId?.match(/\d+$/)?.[0] ?? 0)), 0) + 1;
  const result: ScriptScene[] = [];

  parsed.forEach((section, sectionIndex) => {
    const existingSection = currentSections[sectionIndex];
    const sectionId = existingSection?.id ?? `section-${String(nextSectionNumber++).padStart(3, '0')}`;
    section.lines.forEach((line, lineIndex) => {
      const existing = existingSection?.scenes[lineIndex];
      const speaker = contentMode === 'narrated-explainer'
        ? 'HOST'
        : line.speaker ?? existing?.speaker ?? (lineIndex % 2 === 0 ? 'A' : 'B');
      result.push({
        id: existing?.id ?? `scene-${String(nextSceneNumber++).padStart(3, '0')}`,
        sectionId,
        speaker,
        narration: line.narration,
        headline: section.headline,
        visualQuery: existing?.visualQuery ?? line.narration,
        visualType: existing?.visualType ?? (visualMode === 'infographic' ? 'stock-photo' : 'character'),
        visualAssetPath: existing?.visualAssetPath ?? null,
        durationHintSeconds: existing?.durationHintSeconds ?? null,
        overlays: existing?.overlays ?? [],
        status: existing?.status ?? 'draft',
      });
    });
  });

  return result;
}

function splitCaption(caption: string): { body: string; hashtags: string[] } {
  const hashtags = Array.from(new Set(caption.match(/#[a-z0-9_]+/gi)?.map(tag => tag.toLowerCase()) ?? []));
  const body = caption
    .replace(/(^|\s)#[a-z0-9_]+/gi, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
  return { body, hashtags };
}

function combineCaption(body: string, hashtags: string[]): string {
  return [body.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
}

function activityLabel(action: string): string {
  if (action === 'brief') return 'Creating your title, description and thumbnail hook…';
  if (action === 'script') return 'Creating your script…';
  if (action === 'metadata') return 'Creating titles, descriptions and captions…';
  if (action === 'thumbnail') return 'Creating the thumbnail…';
  if (action === 'save-review' || action === 'save-scenes' || action === 'save-metadata') return 'Saving your changes…';
  if (action === 'continue-visuals') return 'Preparing the visual workspace…';
  if (action === 'prepare-assets') return 'Preparing pictures, thumbnail and audio…';
  if (action === 'render-pack') return 'Rendering your videos…';
  if (action === 'extract-shorts') return 'Extracting and rendering shorts…';
  if (action === 'publish-youtube') return 'Uploading videos to YouTube…';
  if (action === 'publish-instagram') return 'Uploading reels to Instagram…';
  if (action.startsWith('visual-')) return 'Replacing the selected picture…';
  if (action.startsWith('auto')) return 'Creating the complete video pack…';
  return 'Working on your project…';
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [debate, setDebate] = useState<Debate | null>(null);

  const [editScenes, setEditScenes] = useState<ScriptScene[]>([]);
  const [editMetadataFields, setEditMetadataFields] = useState<ProjectMetadata | null>(null);
  const [editReels, setEditReels] = useState<ReelScript[]>([]);
  const [scriptDocument, setScriptDocument] = useState('');
  const [reviewTab, setReviewTab] = useState<ReviewTab>('script');
  const [metadataPlatform, setMetadataPlatform] = useState<MetadataPlatform>('youtube');

  const [job, setJob] = useState<JobView | null>(null);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [activityMessage, setActivityMessage] = useState('');
  const [options, setOptions] = useState<Options | null>(null);
  const [cfg, setCfg] = useState<RunConfig>(DEFAULT_CFG);
  const [useCustom, setUseCustom] = useState(false);
  const [auto, setAuto] = useState(false);
  const [autoStep, setAutoStep] = useState<AutoStep>(null);
  const [creationDraftSaved, setCreationDraftSaved] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [visualScenes, setVisualScenes] = useState<VisualScene[]>([]);
  const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
  const [visualsConfigured, setVisualsConfigured] = useState(true);
  const [globalBusy, setGlobalBusy] = useState<{ debateName: string; kind: string; stage: string } | null>(null);
  const [previewing, setPreviewing] = useState('');
  const [theme, setTheme] = useState<Theme>('light');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('setup');
  const [homeView, setHomeView] = useState<HomeView>('projects');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number | null>(null);
  const [publishingReadiness, setPublishingReadiness] = useState<PublishingReadiness | null>(null);
  const [checkingPublishing, setCheckingPublishing] = useState(false);
  const [generatePlanSource, setGeneratePlanSource] = useState<GeneratePlanSource | null>(null);
  const [generatePlanSelection, setGeneratePlanSelection] = useState<Record<GeneratePlanStage, boolean>>({
    script: true,
    metadata: true,
    visuals: true,
    thumbnail: true,
    audio: true,
    video: true,
    shorts: true,
    publish: false,
  });
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageCalls, setUsageCalls] = useState<UsageCall[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [thumbnailFeedback, setThumbnailFeedback] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const thumbnailVariantRef = useRef(0);

  useEffect(() => {
    fetch('/api/options').then(r => r.json()).then(setOptions).catch(() => {});
    refreshProjects();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const nextTheme: Theme = saved === 'dark' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
  }, []);

  function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    document.body.dataset.theme = nextTheme;
  }

  function saveCreationDraft() {
    localStorage.setItem(CREATION_DRAFT_KEY, JSON.stringify({ topic, context, config: cfg }));
    setCreationDraftSaved(true);
  }

  useEffect(() => {
    if (debate?.debateName) {
      refreshVisuals(debate.debateName);
      refreshAudio(debate.debateName);
    } else {
      setVisualScenes([]);
      setAudioSegments([]);
    }
  }, [debate?.debateName]);

  useEffect(() => {
    if (workspaceSection !== 'publish' || !debate?.debateName) return;
    let cancelled = false;
    setCheckingPublishing(true);
    fetch('/api/publish-readiness?platform=all')
      .then(jsonOrThrow)
      .then(data => { if (!cancelled) setPublishingReadiness(data as PublishingReadiness); })
      .catch(() => { if (!cancelled) setPublishingReadiness(null); })
      .finally(() => { if (!cancelled) setCheckingPublishing(false); });
    return () => { cancelled = true; };
  }, [workspaceSection, debate?.debateName]);

  useEffect(() => {
    if (visualScenes.length === 0) setSelectedVisualId(null);
    else if (!visualScenes.some(scene => scene.id === selectedVisualId)) setSelectedVisualId(visualScenes[0].id);
  }, [visualScenes, selectedVisualId]);

  async function refreshProjects() {
    try {
      const data = await jsonOrThrow(await fetch('/api/debate'));
      setProjects(data.projects ?? []);
    } catch { /* the editor remains usable if project history cannot load */ }
  }

  async function refreshLogs() {
    setLogsLoading(true);
    try {
      const data = await jsonOrThrow(await fetch('/api/logs', { cache: 'no-store' }));
      setUsage(data.usage as UsageSummary);
      setUsageCalls((data.calls ?? []) as UsageCall[]);
    } catch { /* Logs must never block the video workflow. */ }
    finally { setLogsLoading(false); }
  }

  async function refreshVisuals(debateName: string) {
    try {
      const data = await jsonOrThrow(await fetch(`/api/debate/${debateName}/visuals`));
      setVisualsConfigured(data.configured);
      setVisualScenes(data.plan?.scenes ?? []);
    } catch { setVisualScenes([]); }
  }

  async function refreshAudio(debateName: string) {
    try {
      const data = await jsonOrThrow(await fetch(`/api/debate/${debateName}/audio`));
      setAudioSegments(data.current ? data.segments ?? [] : []);
    } catch { setAudioSegments([]); }
  }

  // Poll whether a render is running anywhere, so we can disable render buttons app-wide.
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const d = await (await fetch('/api/job/active')).json();
        setGlobalBusy(d.active ? { debateName: d.debateName, kind: d.kind, stage: d.stage } : null);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  function loadDebate(d: Partial<Debate> & { debateName: string }) {
    const savedOutputType = d.config?.outputType === 'short' ? 'short' : 'youtube';
    const savedLength = typeof d.config?.videoLengthMinutes === 'number' ? d.config.videoLengthMinutes : 3;
    const norm: Debate = {
      debateName: d.debateName,
      topic: d.topic ?? '',
      context: d.context ?? '',
      script: d.script ?? '',
      scenes: normalizeScriptSectionIds(d.scenes ?? [], sceneCountForLength(savedLength, savedOutputType)),
      metadata: d.metadata ?? null,
      metadataFields: d.metadataFields ?? null,
      config: d.config ?? null,
      thumbnailExists: d.thumbnailExists ?? false,
      audioExists: d.audioExists ?? false,
      videoExists: d.videoExists ?? false,
      reelScripts: d.reelScripts ?? [],
      reelsCount: d.reelsCount ?? 0,
      reelsTargetCount: d.reelsTargetCount ?? 0,
      publishing: d.publishing ?? null,
    };
    setDebate(norm);
    setTopic(norm.topic);
    setContext(norm.context);
    setEditScenes(norm.scenes);
    setScriptDocument(formatScriptDocument(norm.scenes, (norm.config?.contentMode ?? DEFAULT_CFG.contentMode) as RunConfig['contentMode']));
    setSelectedSubtitleId(norm.scenes[0]?.id ?? null);
    setEditMetadataFields(norm.metadataFields);
    setEditReels(norm.reelScripts);
    const savedSceneTitleMode = d.config?.sceneTitleMode
      ?? (d.config?.sceneTitlesEnabled === false ? 'hidden' : 'persistent');
    const savedContentMode = (norm.config?.contentMode ?? DEFAULT_CFG.contentMode) as RunConfig['contentMode'];
    setCfg({
      ...DEFAULT_CFG,
      ...(norm.config ?? {}),
      contentMode: savedContentMode,
      visualMode: visualModeForContentMode(savedContentMode),
      sceneTitleMode: savedSceneTitleMode,
      sceneTitlesEnabled: savedSceneTitleMode !== 'hidden',
      thumbnailHook: norm.config?.thumbnailHook ?? norm.metadataFields?.thumbnailHook ?? '',
      voices: { ...DEFAULT_CFG.voices, ...(norm.config?.voices ?? {}) },
      customSubtitle: norm.config?.customSubtitle ?? DEFAULT_CUSTOM,
    });
    setUseCustom(!!norm.config?.customSubtitle);
    setThumbnailFeedback('');
    thumbnailVariantRef.current = 0;
    setNonce(n => n + 1);
    localStorage.setItem(LS_KEY, norm.debateName);
  }

  async function refetchDebate(name: string) {
    const res = await fetch(`/api/debate/${name}`);
    if (res.ok) {
      loadDebate(await res.json());
      await refreshProjects();
      await refreshVisuals(name);
      await refreshAudio(name);
    }
  }

  async function jsonOrThrow(res: Response) {
    const data = await res.json();
    if (!res.ok) throw new Error((data.error || 'Request failed.') + (data.detail ? `\n${data.detail}` : ''));
    return data;
  }

  async function call(action: string, fn: () => Promise<void>) {
    setError('');
    setBusy(action);
    setActivityMessage(activityLabel(action));
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(''); setActivityMessage(''); await refreshLogs(); }
  }

  // Start a long job and resolve when it finishes (rejecting on error). Updates progress
  // and reloads the debate on completion. Used by both manual buttons and the auto chain.
  async function startJobAndWait(startUrl: string, kind: JobKind, name: string, requestBody?: unknown) {
    const { jobId, attempt } = await jsonOrThrow(await fetch(startUrl, {
      method: 'POST',
      ...(requestBody === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }),
    }));
    setJob({ id: jobId, kind, stage: kind, status: 'running', attempt });
    await new Promise<void>((resolve, reject) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const j = await jsonOrThrow(await fetch(`/api/job/${jobId}`));
          setJob({ id: jobId, kind, stage: j.stage, status: j.status, attempt: j.attempt, logs: j.logs, error: j.error });
          if (j.status !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (j.status === 'error') { setJob(null); reject(new Error(j.error || 'Render failed.')); }
            else resolve();
          }
        } catch (err) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setJob(null);
          reject(err instanceof Error ? err : new Error('Polling failed.'));
        }
      }, 1500);
    });
    setJob(null);
    await refetchDebate(name);
  }

  function buildConfigPayload(): RunConfig {
    const { customSubtitle, ...rest } = cfg;
    const normalized = { ...rest, visualMode: visualModeForContentMode(rest.contentMode) };
    return useCustom ? { ...normalized, customSubtitle: cleanCustom(customSubtitle ?? DEFAULT_CUSTOM) } : normalized;
  }

  const generateProjectBrief = () => {
    void call('brief', async () => {
      const data = await jsonOrThrow(await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentMode: cfg.contentMode }),
      }));
      setTopic(data.brief.title);
      setContext(data.brief.description);
      setCfg(current => ({ ...current, thumbnailHook: data.brief.thumbnailHook }));
      setCreationDraftSaved(false);
    });
  };

  // ---- raw steps (composable; used by manual buttons and the auto chain) ----
  // Each takes an optional debate name so the non-stop chain can thread it through
  // synchronously (React state hasn't settled mid-chain). Manual/gated callers omit it
  // and fall back to the current debate.
  const rawScript = async (configOverride?: RunConfig): Promise<string> => {
    if (!topic.trim()) throw new Error('Please enter a topic.');
    setActivityMessage('Writing and structuring your script…');
    // Capture the new-project choices before loadDebate initializes the project state.
    const selectedConfig = configOverride ?? buildConfigPayload();
    const data = await jsonOrThrow(await fetch('/api/debate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        context,
        contentMode: selectedConfig.contentMode,
        outputType: selectedConfig.outputType,
        videoLengthMinutes: selectedConfig.videoLengthMinutes,
        extractReels: selectedConfig.extractReels,
      }),
    }));
    await jsonOrThrow(await fetch(`/api/debate/${data.debateName}/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: selectedConfig }),
    }));
    loadDebate({ ...data, config: selectedConfig });
    setWorkspaceSection('storyboard');
    await refreshProjects();
    return data.debateName as string;
  };
  const rawSaveScenes = async (name = debate!.debateName) => {
    setActivityMessage('Saving the reviewed script…');
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/scenes`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes: editScenes }),
    }));
    setEditScenes(data.scenes);
    setDebate(d => (d ? {
      ...d,
      script: data.script,
      scenes: data.scenes,
      audioExists: false,
      videoExists: false,
    } : d));
    setScriptDocument(formatScriptDocument(data.scenes, cfg.contentMode));
    setAudioSegments([]);
  };
  const rawMetadata = async (name = debate!.debateName, thumbnailHookOverride = cfg.thumbnailHook) => {
    setActivityMessage('Creating titles, descriptions and reel captions…');
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/metadata`, { method: 'POST' }));
    let metadata = data.metadata;
    let metadataFields = data.metadataFields as ProjectMetadata;
    if (thumbnailHookOverride.trim()) {
      const saved = await jsonOrThrow(await fetch(`/api/debate/${name}/metadata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadataFields: { ...metadataFields, thumbnailHook: thumbnailHookOverride.trim() },
        }),
      }));
      metadata = saved.metadata;
      metadataFields = saved.metadataFields;
    }
    setEditMetadataFields(metadataFields);
    setDebate(d => (d ? { ...d, metadata, metadataFields } : d));
  };
  const rawSaveMetadata = async (name = debate!.debateName) => {
    if (!editMetadataFields) throw new Error('Generate metadata first.');
    setActivityMessage('Saving publishing metadata…');
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/metadata`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadataFields: editMetadataFields }),
    }));
    setEditMetadataFields(data.metadataFields);
    setDebate(d => (d ? { ...d, metadata: data.metadata, metadataFields: data.metadataFields } : d));
  };
  const saveConfig = async (name = debate!.debateName, selectedConfig = buildConfigPayload()) => {
    await jsonOrThrow(await fetch(`/api/debate/${name}/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: selectedConfig }),
    }));
  };
  const updateSceneTitles = async (enabled: boolean) => {
    const previous = cfg.sceneTitlesEnabled;
    const previousMode = cfg.sceneTitleMode;
    const sceneTitleMode: RunConfig['sceneTitleMode'] = enabled ? 'persistent' : 'hidden';
    const selectedConfig = { ...buildConfigPayload(), sceneTitlesEnabled: enabled, sceneTitleMode };
    setCfg(current => ({ ...current, sceneTitlesEnabled: enabled, sceneTitleMode }));
    if (!debate) return;
    try {
      await saveConfig(debate.debateName, selectedConfig);
      setDebate(current => current ? {
        ...current,
        config: { ...(current.config ?? {}), sceneTitlesEnabled: enabled, sceneTitleMode },
        videoExists: false,
        publishing: null,
      } : current);
    } catch (err) {
      setCfg(current => ({ ...current, sceneTitlesEnabled: previous, sceneTitleMode: previousMode }));
      setError(err instanceof Error ? err.message : 'Could not save the scene-title setting.');
    }
  };
  const rawThumbnail = async (name = debate!.debateName, variant = 0, showConfirmation = false) => {
    setActivityMessage('Creating the thumbnail…');
    setThumbnailFeedback('');
    await jsonOrThrow(await fetch(`/api/debate/${name}/thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant }),
    }));
    setDebate(d => (d ? { ...d, thumbnailExists: true } : d));
    setNonce(n => n + 1);
    if (showConfirmation) setThumbnailFeedback(
      cfg.contentMode === 'narrated-explainer'
        ? 'Thumbnail updated with a different project picture.'
        : 'Thumbnail rebuilt successfully.',
    );
  };
  const rawVisuals = async (name = debate!.debateName, selectedConfig = buildConfigPayload()) => {
    setActivityMessage('Finding and preparing scene pictures…');
    await saveConfig(name, selectedConfig);
    try { await startJobAndWait(`/api/debate/${name}/visuals`, 'visuals', name); }
    finally { await refreshVisuals(name); }
  };
  const rawAudio = async (name = debate!.debateName, selectedConfig = buildConfigPayload()) => {
    setActivityMessage('Generating narration audio…');
    await saveConfig(name, selectedConfig); // voices / TTS model / speed
    await startJobAndWait(`/api/debate/${name}/audio`, 'audio', name);
  };
  const rawVideoRender = async (name = debate!.debateName, selectedConfig = buildConfigPayload()) => {
    await saveConfig(name, selectedConfig); // subtitle / video style
    await startJobAndWait(`/api/debate/${name}/video`, 'video', name);
  };
  const rawExtract = async (name = debate!.debateName) => {
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/extract-reels`, { method: 'POST' }));
    setEditReels(data.parts);
    setDebate(d => (d ? { ...d, reelScripts: data.parts, reelsTargetCount: data.parts.length, reelsCount: 0 } : d));
  };
  const rawReels = async (name = debate!.debateName) => startJobAndWait(`/api/debate/${name}/reels`, 'reels', name);
  const refreshPublishingReadiness = async (target: PublishTarget = 'all') => {
    setCheckingPublishing(true);
    try {
      const data = await jsonOrThrow(await fetch(`/api/publish-readiness?platform=${target}`)) as PublishingReadiness;
      setPublishingReadiness(current => ({
        ready: target === 'all' ? data.ready : (current?.ready ?? false),
        missing: data.missing,
        platforms: {
          youtube: data.platforms.youtube ?? current?.platforms.youtube ?? null,
          instagram: data.platforms.instagram ?? current?.platforms.instagram ?? null,
        },
      }));
      return data;
    } finally {
      setCheckingPublishing(false);
    }
  };
  const rawPublish = async (target: PublishTarget, name = debate!.debateName) => {
    const readiness = await refreshPublishingReadiness(target);
    if (!readiness.ready) {
      if (readiness.missing.length) {
        throw new Error(`Set up ${target} publishing in .env first. Missing: ${readiness.missing.join(', ')}`);
      }
      const status = target === 'youtube'
        ? readiness.platforms.youtube
        : target === 'instagram'
          ? readiness.platforms.instagram
          : readiness.platforms.youtube?.valid === false
            ? readiness.platforms.youtube
            : readiness.platforms.instagram;
      throw new Error(`${target === 'instagram' ? 'Instagram' : 'YouTube'} authorization needs attention: ${status?.message ?? 'Token validation failed.'}`);
    }
    const kind: JobKind = target === 'all' ? 'publish' : `publish-${target}`;
    try { await startJobAndWait(`/api/debate/${name}/publish`, kind, name, { target }); }
    finally { await refetchDebate(name); }
  };

  // ---- manual buttons ----
  const generateScript = () => call('script', async () => { await rawScript(); });
  const saveScenes = () => call('save-scenes', rawSaveScenes);
  const generateMetadata = () => call('metadata', rawMetadata);
  const generateThumbnail = () => call('thumbnail', async () => {
    thumbnailVariantRef.current += 1;
    await rawThumbnail(debate!.debateName, thumbnailVariantRef.current, true);
  });
  const generateVisuals = () => call('visuals', rawVisuals);
  const generateAudio = () => call('audio', rawAudio);
  const generateVideo = () => call('video', rawVideoRender);
  const extractReels = () => call('extract', rawExtract);
  const saveReel = (part: number, script: string) => call(`save-reel-${part}`, async () => {
    await jsonOrThrow(await fetch(`/api/debate/${debate!.debateName}/reels-scripts`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part, script }),
    }));
    setDebate(d => (d ? { ...d, reelScripts: d.reelScripts.map(r => r.part === part ? { part, script } : r) } : d));
  });
  const generateReels = () => call('reels', rawReels);
  const publishYouTube = () => call('publish-youtube', async () => rawPublish('youtube'));
  const publishInstagram = () => call('publish-instagram', async () => rawPublish('instagram'));
  const regenerateVisual = (scene: VisualScene) => call(`visual-${scene.id}`, async () => {
    const data = await jsonOrThrow(await fetch(`/api/debate/${debate!.debateName}/visuals/${scene.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: scene.searchQuery }),
    }));
    setVisualScenes(items => items.map(item => item.id === scene.id ? data.scene : item));
    setNonce(value => value + 1);
  });

  function playSubtitleAudio(subtitleIndex: number) {
    const clips = audioSegments.filter(segment => segment.sourceLineIndex === subtitleIndex);
    if (clips.length === 0) return;
    if (playingSubtitleIndex === subtitleIndex && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingSubtitleIndex(null);
      return;
    }
    audioRef.current?.pause();
    setPreviewing('');
    setPlayingSubtitleIndex(subtitleIndex);
    let clipIndex = 0;
    const playNext = () => {
      const clip = clips[clipIndex++];
      if (!clip) {
        setPlayingSubtitleIndex(null);
        audioRef.current = null;
        return;
      }
      const audio = new Audio(clip.url);
      audioRef.current = audio;
      audio.onended = playNext;
      audio.onerror = () => setPlayingSubtitleIndex(null);
      audio.play().catch(() => setPlayingSubtitleIndex(null));
    };
    playNext();
  }

  function changePictureBoundary(visualIndex: number, boundary: 'start' | 'end', subtitleIndex: number) {
    if (sceneEditsChanged) {
      setError('Save script changes before adjusting picture timing.');
      return;
    }
    call('picture-timing', async () => {
      const updated = visualScenes.map(scene => ({ ...scene }));
      const current = updated[visualIndex];
      if (!current) return;
      if (boundary === 'start' && visualIndex > 0) {
        current.lineStart = subtitleIndex;
        updated[visualIndex - 1].lineEnd = subtitleIndex - 1;
      } else if (boundary === 'end' && visualIndex < updated.length - 1) {
        current.lineEnd = subtitleIndex;
        updated[visualIndex + 1].lineStart = subtitleIndex + 1;
      } else return;
      const data = await jsonOrThrow(await fetch(`/api/debate/${debate!.debateName}/visuals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ranges: updated.map(scene => ({ id: scene.id, lineStart: scene.lineStart, lineEnd: scene.lineEnd })),
        }),
      }));
      setVisualScenes(data.plan.scenes);
      setDebate(currentDebate => currentDebate ? { ...currentDebate, videoExists: false } : currentDebate);
    });
  }

  // Generate only the next reviewable step.
  const generateNextStep = () => call('script', async () => {
    const name = await rawScript();
    await rawMetadata(name, cfg.thumbnailHook);
    setReviewTab('script');
    setAuto(false);
    setAutoStep(null);
  });

  // Run every remaining creation stage without review pauses.
  const generateAllVideos = () => call('auto', async () => {
    setAuto(true); setAutoStep('running');
    try {
      const fullPackConfig: RunConfig = {
        ...buildConfigPayload(),
        extractReels: cfg.outputType === 'youtube' && cfg.extractReels,
      };
      setCfg(fullPackConfig);
      const name = await rawScript(fullPackConfig);
      await rawMetadata(name, fullPackConfig.thumbnailHook);
      if (fullPackConfig.visualMode === 'infographic') await rawVisuals(name, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube') await rawThumbnail(name);
      await rawAudio(name, fullPackConfig);
      await rawVideoRender(name, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube' && fullPackConfig.extractReels) {
        await rawExtract(name);
        await rawReels(name);
      }
      await refetchDebate(name);
      setWorkspaceSection('publish');
    } finally {
      setAuto(false); setAutoStep(null);
    }
  });

  async function continueAfterScript() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try {
      if (JSON.stringify(editScenes) !== JSON.stringify(debate!.scenes)) await rawSaveScenes();
      await rawMetadata();
      if (cfg.visualMode === 'infographic') {
        await rawVisuals();
        if (cfg.outputType === 'youtube') await rawThumbnail();
        setAutoStep('awaiting-visuals');
        setWorkspaceSection('storyboard');
      } else {
        if (cfg.outputType === 'youtube') await rawThumbnail();
        await renderAfterReviews();
        setWorkspaceSection('storyboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare the video.');
      setAutoStep('awaiting-script');
    } finally { setBusy(''); }
  }

  async function renderAfterReviews() {
    await rawAudio();
    await rawVideoRender();
    if (cfg.outputType !== 'youtube' || !cfg.extractReels) {
      setAuto(false); setAutoStep(null);
      return;
    }
    try { await rawExtract(); setAutoStep('awaiting-reels'); }
    catch (e) {
      setError(`Video done. Reel extraction failed: ${e instanceof Error ? e.message : ''}`);
      setAuto(false); setAutoStep(null);
    }
  }

  async function continueAfterVisuals() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try { await renderAfterReviews(); setWorkspaceSection('storyboard'); }
    catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed.');
      setAutoStep('awaiting-visuals');
    } finally { setBusy(''); }
  }

  async function continueAfterReels() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try { await rawReels(); setAuto(false); setAutoStep(null); setReviewTab('metadata'); setWorkspaceSection('storyboard'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Reel build failed.'); setAutoStep('awaiting-reels'); }
    finally { setBusy(''); }
  }

  function startNew() {
    localStorage.removeItem(LS_KEY);
    let saved: { topic?: string; context?: string; config?: Partial<RunConfig> } = {};
    try { saved = JSON.parse(localStorage.getItem(CREATION_DRAFT_KEY) ?? '{}'); }
    catch { /* ignore an invalid local draft */ }
    setDebate(null); setTopic(saved.topic ?? ''); setContext(saved.context ?? '');
    const savedContentMode = saved.config?.contentMode ?? DEFAULT_CFG.contentMode;
    setCfg({
      ...DEFAULT_CFG,
      ...(saved.config ?? {}),
      contentMode: savedContentMode,
      visualMode: visualModeForContentMode(savedContentMode),
      voices: { ...DEFAULT_CFG.voices, ...(saved.config?.voices ?? {}) },
    });
    setEditScenes([]); setEditMetadataFields(null); setEditReels([]); setScriptDocument('');
    setReviewTab('script'); setMetadataPlatform('youtube');
    setVisualScenes([]);
    setJob(null); setError(''); setAuto(false); setAutoStep(null);
    setCreationDraftSaved(!!saved.topic);
    setShowAdvanced(false);
    setWorkspaceSection('setup');
    setHomeView('create');
  }

  function showProjects() {
    localStorage.removeItem(LS_KEY);
    setDebate(null); setJob(null); setError(''); setAuto(false); setAutoStep(null);
    setHomeView('projects');
  }

  function showLogs() {
    localStorage.removeItem(LS_KEY);
    setDebate(null); setJob(null); setError(''); setAuto(false); setAutoStep(null);
    setHomeView('logs');
    void refreshLogs();
  }

  function returnToVideoSetup() {
    setHomeView('create');
    setWorkspaceSection('setup');
  }

  function returnToReviewedScript() {
    setHomeView('projects');
    setWorkspaceSection('storyboard');
  }

  function openGeneratePlan(source: GeneratePlanSource) {
    setGeneratePlanSelection({
      script: true,
      metadata: true,
      visuals: true,
      thumbnail: true,
      audio: true,
      video: true,
      shorts: true,
      publish: false,
    });
    setGeneratePlanSource(source);
  }

  function toggleCreationOutput(target: 'youtube' | 'reels') {
    setCfg(current => {
      const youtubeSelected = current.outputType === 'youtube';
      const reelsSelected = current.outputType === 'short' || current.extractReels;

      if (target === 'youtube') {
        if (youtubeSelected && !reelsSelected) return current;
        if (youtubeSelected) {
          return {
            ...current,
            outputType: 'short',
            extractReels: false,
            videoLengthMinutes: REEL_DURATION_MINUTES,
          };
        }
        return {
          ...current,
          outputType: 'youtube',
          extractReels: true,
          videoLengthMinutes: 3,
        };
      }

      if (reelsSelected && !youtubeSelected) return current;
      if (reelsSelected) return { ...current, extractReels: false };
      return { ...current, outputType: 'youtube', extractReels: true };
    });
    setCreationDraftSaved(false);
  }

  async function openProject(projectName: string) {
    if (working || projectName === name) return;
    await call('open-project', async () => {
      const data = await jsonOrThrow(await fetch(`/api/debate/${projectName}`));
      loadDebate(data);
      setWorkspaceSection(data.videoExists ? 'publish' : 'storyboard');
      setHomeView('projects');
    });
  }

  const setVoice = (sp: 'HOST' | 'A' | 'B', v: string) => {
    if (cfg.voices[sp] === v) return;
    const voices = { ...cfg.voices, [sp]: v };
    const selectedConfig = { ...buildConfigPayload(), voices };
    setCfg(c => ({ ...c, voices }));
    setAudioSegments([]);
    setDebate(current => current ? {
      ...current,
      config: { ...(current.config ?? {}), voices },
      audioExists: false,
      videoExists: false,
      publishing: null,
    } : current);
    setError('Narrator voice changed. Generate narration audio before continuing to Render.');
    if (debate) {
      void saveConfig(debate.debateName, selectedConfig).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not save the narrator voice.');
      });
    }
  };

  async function previewVoice(voice: string) {
    try {
      if (audioRef.current) audioRef.current.pause();
      setPreviewing(voice);
      const a = new Audio(`/api/voice-sample/${voice}`);
      audioRef.current = a;
      a.onended = () => setPreviewing('');
      a.onerror = () => setPreviewing('');
      await a.play();
    } catch { setPreviewing(''); }
  }
  const setCustom = (k: keyof CustomSubtitle, v: string | number) =>
    setCfg(c => ({ ...c, customSubtitle: { ...(c.customSubtitle ?? DEFAULT_CUSTOM), [k]: v } }));

  const sceneEditsChanged = !!debate && JSON.stringify(editScenes) !== JSON.stringify(debate.scenes);
  const hasInvalidScenes = editScenes.length === 0 || editScenes.some(scene => !scene.narration.trim());
  const totalWords = editScenes.reduce((sum, scene) => sum + scene.narration.trim().split(/\s+/).filter(Boolean).length, 0);
  const estimatedSeconds = Math.max(1, Math.round(totalWords / 2.35));
  let timelineCursor = 0;
  const subtitleTimeline = editScenes.map((scene, index) => {
    const generatedDuration = audioSegments
      .filter(segment => segment.sourceLineIndex === index)
      .reduce((sum, segment) => sum + segment.durationSeconds, 0);
    const estimatedDuration = Math.max(1.5, scene.narration.trim().split(/\s+/).filter(Boolean).length / 2.35);
    const duration = (generatedDuration || estimatedDuration) + 0.1;
    const start = timelineCursor;
    timelineCursor += duration;
    return { start, end: timelineCursor, duration };
  });
  const editorDuration = subtitleTimeline.at(-1)?.end ?? 0;
  const metadataChanged = !!debate && JSON.stringify(editMetadataFields) !== JSON.stringify(debate.metadataFields);
  const metadataInvalid = !editMetadataFields
    || !editMetadataFields.youtube.title.trim()
    || !editMetadataFields.youtube.description.trim()
    || editMetadataFields.youtube.hashtags.length < 8
    || editMetadataFields.youtube.hashtags.length > 12
    || editMetadataFields.youtube.hashtags.some(tag => !/^#[a-z0-9]+$/.test(tag))
    || !editMetadataFields.thumbnailHook.trim()
    || editMetadataFields.reels.some(reel => !reel.caption.trim());

  function updateYoutubeMetadata(field: 'title' | 'description', value: string) {
    setEditMetadataFields(current => current ? {
      ...current,
      youtube: { ...current.youtube, [field]: value },
    } : current);
  }

  function updateHashtags(value: string) {
    const hashtags = value.split(/[\s,]+/).filter(Boolean).map(tag => {
      const clean = tag.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9]/g, '');
      return clean ? `#${clean}` : '';
    }).filter(Boolean);
    setEditMetadataFields(current => current ? {
      ...current,
      youtube: { ...current.youtube, hashtags },
    } : current);
  }

  function updateReelCaptionBody(part: number, body: string) {
    setEditMetadataFields(current => current ? {
      ...current,
      reels: current.reels.map(reel => {
        if (reel.part !== part) return reel;
        return { ...reel, caption: combineCaption(body, splitCaption(reel.caption).hashtags) };
      }),
    } : current);
  }

  function addReelHashtag(part: number, rawTag: string) {
    const tag = `#${rawTag.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9_]/g, '')}`;
    if (tag === '#') return;
    setEditMetadataFields(current => current ? {
      ...current,
      reels: current.reels.map(reel => {
        if (reel.part !== part) return reel;
        const parsed = splitCaption(reel.caption);
        return { ...reel, caption: combineCaption(parsed.body, Array.from(new Set([...parsed.hashtags, tag]))) };
      }),
    } : current);
  }

  function removeReelHashtag(part: number, tag: string) {
    setEditMetadataFields(current => current ? {
      ...current,
      reels: current.reels.map(reel => {
        if (reel.part !== part) return reel;
        const parsed = splitCaption(reel.caption);
        return { ...reel, caption: combineCaption(parsed.body, parsed.hashtags.filter(item => item !== tag)) };
      }),
    } : current);
  }

  function updateScriptDocument(value: string) {
    setScriptDocument(value);
    setEditScenes(parseScriptDocument(value, editScenes, cfg.contentMode, cfg.visualMode));
  }

  function appendDocumentScene() {
    const number = Math.max(1, groupScriptScenes(editScenes).length + 1);
    updateScriptDocument(`${scriptDocument.trimEnd()}\n\nSCENE ${number} — New scene\n`);
  }

  function updateScene(sceneId: string, patch: Partial<ScriptScene>) {
    setEditScenes(items => items.map(scene => scene.id === sceneId ? { ...scene, ...patch } : scene));
  }

  function nextSceneId(): string {
    const highest = editScenes.reduce((max, scene) => {
      const value = Number(scene.id.match(/\d+$/)?.[0] ?? 0);
      return Math.max(max, value);
    }, 0);
    return `scene-${String(highest + 1).padStart(3, '0')}`;
  }

  function nextSectionId(): string {
    const highest = editScenes.reduce((max, scene) => {
      const value = Number(scene.sectionId?.match(/\d+$/)?.[0] ?? 0);
      return Math.max(max, value);
    }, 0);
    return `section-${String(highest + 1).padStart(3, '0')}`;
  }

  function createSceneDraft(sectionId: string, headline = '', speaker?: ScriptScene['speaker']): ScriptScene {
    const id = nextSceneId();
    const previousSpeaker = editScenes.at(-1)?.speaker ?? 'B';
    return {
      id,
      sectionId,
      speaker: speaker ?? (cfg.contentMode === 'narrated-explainer'
        ? 'HOST'
        : previousSpeaker === 'A' ? 'B' : 'A'),
      narration: '',
      headline,
      visualQuery: '',
      visualType: cfg.visualMode === 'infographic' ? 'stock-photo' : 'character',
      visualAssetPath: null,
      durationHintSeconds: null,
      overlays: [],
      status: 'draft',
    };
  }

  function addScriptSection() {
    setEditScenes(items => [...items, createSceneDraft(nextSectionId())]);
  }

  function addSubtitleAfter(sceneId: string, sectionId: string, headline: string) {
    const source = editScenes.find(scene => scene.id === sceneId);
    const scene = createSceneDraft(sectionId, headline, source?.speaker);
    setEditScenes(items => {
      const index = items.findIndex(item => item.id === sceneId);
      return [...items.slice(0, index + 1), scene, ...items.slice(index + 1)];
    });
  }

  function duplicateStoryboardScene(sceneId: string) {
    const source = editScenes.find(scene => scene.id === sceneId);
    if (!source) return;
    const copy: ScriptScene = {
      ...source,
      id: nextSceneId(),
      visualAssetPath: null,
      overlays: source.overlays.map(overlay => ({ ...overlay })),
      status: 'draft',
    };
    setEditScenes(items => {
      const index = items.findIndex(scene => scene.id === sceneId);
      return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
    });
  }

  function deleteStoryboardScene(sceneId: string) {
    if (editScenes.length <= 1) return;
    setEditScenes(items => items.filter(scene => scene.id !== sceneId));
  }

  function moveStoryboardScene(sceneId: string, direction: -1 | 1) {
    setEditScenes(items => {
      const index = items.findIndex(scene => scene.id === sceneId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const reordered = [...items];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  function moveSubtitleWithinSection(sceneId: string, sectionId: string, direction: -1 | 1) {
    const section = scriptSections.find(item => item.id === sectionId);
    if (!section) return;
    const localIndex = section.scenes.findIndex(scene => scene.id === sceneId);
    const targetScene = section.scenes[localIndex + direction];
    if (!targetScene) return;
    setEditScenes(items => {
      const index = items.findIndex(scene => scene.id === sceneId);
      const target = items.findIndex(scene => scene.id === targetScene.id);
      if (index < 0 || target < 0) return items;
      const reordered = [...items];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  function updateSectionTitle(sceneIds: string[], headline: string) {
    const ids = new Set(sceneIds);
    setEditScenes(items => items.map(scene => ids.has(scene.id) ? { ...scene, headline } : scene));
  }

  function moveScriptSection(sectionIndex: number, direction: -1 | 1) {
    const target = sectionIndex + direction;
    if (target < 0 || target >= scriptSections.length) return;
    const reordered = [...scriptSections];
    [reordered[sectionIndex], reordered[target]] = [reordered[target], reordered[sectionIndex]];
    setEditScenes(reordered.flatMap(section => section.scenes));
  }

  function deleteScriptSection(sceneIds: string[]) {
    if (sceneIds.length >= editScenes.length) return;
    const ids = new Set(sceneIds);
    setEditScenes(items => items.filter(scene => !ids.has(scene.id)));
  }

  const useScriptAndContinue = () => call('use-script', async () => {
    if (sceneEditsChanged) await rawSaveScenes();
    setWorkspaceSection('storyboard');
  });

  const generateAllFromScript = () => call('auto-from-script', async () => {
    const projectName = debate!.debateName;
    const fullPackConfig: RunConfig = {
      ...buildConfigPayload(),
      extractReels: cfg.outputType === 'youtube' && cfg.extractReels,
    };
    setCfg(fullPackConfig);
    setAuto(true);
    setAutoStep('running');
    try {
      if (sceneEditsChanged) await rawSaveScenes(projectName);
      if (!editMetadataFields) await rawMetadata(projectName, fullPackConfig.thumbnailHook);
      else if (metadataChanged) await rawSaveMetadata(projectName);
      if (fullPackConfig.visualMode === 'infographic') await rawVisuals(projectName, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube') await rawThumbnail(projectName);
      await rawAudio(projectName, fullPackConfig);
      await rawVideoRender(projectName, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube' && fullPackConfig.extractReels) {
        await rawExtract(projectName);
        await rawReels(projectName);
      }
      await refetchDebate(projectName);
      setWorkspaceSection('publish');
    } finally {
      setAuto(false);
      setAutoStep(null);
    }
  });

  const saveReviewChanges = () => call('save-review', async () => {
    if (sceneEditsChanged) await rawSaveScenes();
    if (editMetadataFields && metadataChanged) await rawSaveMetadata();
  });

  const continueToVisuals = () => call('continue-visuals', async () => {
    const projectName = debate!.debateName;
    if (sceneEditsChanged) await rawSaveScenes(projectName);
    if (!editMetadataFields) await rawMetadata(projectName, cfg.thumbnailHook);
    else if (metadataChanged) await rawSaveMetadata(projectName);
    setWorkspaceSection('visuals');
  });

  const prepareMissingAssets = () => call('prepare-assets', async () => {
    const projectName = debate!.debateName;
    const selectedConfig = buildConfigPayload();
    if (cfg.visualMode === 'infographic' && !visualsReady) await rawVisuals(projectName, selectedConfig);
    if (cfg.outputType === 'youtube' && !debate!.thumbnailExists) await rawThumbnail(projectName);
    if (!debate!.audioExists || audioSegments.length === 0) await rawAudio(projectName, selectedConfig);
    await refetchDebate(projectName);
  });

  const generateAllFromVisuals = () => call('auto-from-assets', async () => {
    const projectName = debate!.debateName;
    const selectedConfig = buildConfigPayload();
    setAuto(true);
    setAutoStep('running');
    try {
      if (cfg.visualMode === 'infographic' && !visualsReady) await rawVisuals(projectName, selectedConfig);
      if (cfg.outputType === 'youtube' && !debate!.thumbnailExists) await rawThumbnail(projectName);
      if (!debate!.audioExists || audioSegments.length === 0) await rawAudio(projectName, selectedConfig);
      await rawVideoRender(projectName, selectedConfig);
      if (selectedConfig.outputType === 'youtube' && selectedConfig.extractReels) {
        await rawExtract(projectName);
        await rawReels(projectName);
      }
      await refetchDebate(projectName);
      setWorkspaceSection('publish');
    } finally {
      setAuto(false);
      setAutoStep(null);
    }
  });

  const extractAndRenderShorts = () => call('extract-shorts', async () => {
    const projectName = debate!.debateName;
    await rawExtract(projectName);
    await rawReels(projectName);
    await refetchDebate(projectName);
  });

  const executeGeneratePlan = () => {
    const source = generatePlanSource;
    if (!source) return;
    setGeneratePlanSource(null);
    call('auto-custom', async () => {
      const selectedConfig: RunConfig = {
        ...buildConfigPayload(),
        extractReels: cfg.outputType === 'youtube' && cfg.extractReels,
      };
      let projectName = debate?.debateName;
      setAuto(true);
      setAutoStep('running');
      try {
        if (source === 'create') {
          if (!generatePlanSelection.script) throw new Error('Select Script to start a new project.');
          projectName = await rawScript(selectedConfig);
        } else if (source === 'script' && sceneEditsChanged) {
          await rawSaveScenes(projectName!);
        }
        if (!projectName) throw new Error('Create a script before running the remaining steps.');
        if (generatePlanSelection.metadata) {
          setHomeView('projects');
          setWorkspaceSection('storyboard');
          await rawMetadata(projectName, selectedConfig.thumbnailHook);
        }
        if (generatePlanSelection.visuals && selectedConfig.visualMode === 'infographic') {
          setHomeView('projects');
          setWorkspaceSection('visuals');
          await rawVisuals(projectName, selectedConfig);
        }
        if (generatePlanSelection.thumbnail && selectedConfig.outputType === 'youtube') {
          setHomeView('projects');
          setWorkspaceSection('visuals');
          await rawThumbnail(projectName);
        }
        if (generatePlanSelection.audio) {
          setHomeView('projects');
          setWorkspaceSection('visuals');
          await rawAudio(projectName, selectedConfig);
        }
        if (generatePlanSelection.video) {
          setHomeView('projects');
          setWorkspaceSection('video');
          await rawVideoRender(projectName, selectedConfig);
        }
        if (generatePlanSelection.shorts && selectedConfig.outputType === 'youtube' && selectedConfig.extractReels) {
          setHomeView('projects');
          setWorkspaceSection('video');
          await rawExtract(projectName);
          await rawReels(projectName);
        }
        if (generatePlanSelection.publish) {
          setHomeView('projects');
          setWorkspaceSection('publish');
          await rawPublish('all', projectName);
        }
        await refetchDebate(projectName);
        setHomeView('projects');
        if (generatePlanSelection.publish) setWorkspaceSection('publish');
        else if (generatePlanSelection.video || generatePlanSelection.shorts) setWorkspaceSection('video');
        else if (generatePlanSelection.visuals || generatePlanSelection.thumbnail || generatePlanSelection.audio) setWorkspaceSection('visuals');
        else setWorkspaceSection('storyboard');
      } finally {
        setAuto(false);
        setAutoStep(null);
      }
    });
  };

  const working = busy !== '' || job !== null;
  const name = debate?.debateName;
  const cs = cfg.customSubtitle ?? DEFAULT_CUSTOM;
  const plannedReels = debate?.reelsTargetCount ?? 0;
  const reelsReady = !!debate && plannedReels > 0 && debate.reelsCount === plannedReels;
  const youtubePublished = !!debate?.publishing?.youtube?.main
    && (!cfg.extractReels || (debate.publishing.youtube.shorts?.length ?? 0) === plannedReels);
  const instagramPublished = plannedReels > 0 && (debate?.publishing?.instagram?.length ?? 0) === plannedReels;
  const publishError = debate?.publishing?.error || error;
  const authErrorPlatform = publishingAuthError(publishError);
  const completePackReady = !!debate?.videoExists
    && (cfg.outputType === 'short' || !cfg.extractReels || reelsReady);
  // A render running on some OTHER debate (our own render is already shown via `job`).
  const renderElsewhere = !!globalBusy && globalBusy.debateName !== name;
  const visualsReady = cfg.visualMode !== 'infographic'
    || (visualScenes.length > 0 && visualScenes.every(scene => scene.imagePath));
  const thumbnailReady = cfg.outputType !== 'youtube' || !!debate?.thumbnailExists;
  const audioReady = !!debate?.audioExists && audioSegments.length > 0;
  const assetsReady = visualsReady && thumbnailReady && audioReady;
  const renderEntryReady = audioReady && visualsReady && !sceneEditsChanged;
  const openRenderScreen = () => {
    if (!audioReady) {
      setError('Generate narration audio before continuing to Render.');
      setWorkspaceSection('visuals');
      return;
    }
    if (!visualsReady) {
      setError('Generate all required pictures before continuing to Render.');
      setWorkspaceSection('visuals');
      return;
    }
    if (sceneEditsChanged) {
      setError('Save the script and regenerate its audio before continuing to Render.');
      setWorkspaceSection('visuals');
      return;
    }
    setError('');
    setWorkspaceSection('video');
  };
  const scriptSections = groupScriptScenes(editScenes);
  const statusForProject = (project: ProjectSummary): Exclude<ProjectFilter, 'all'> => {
    if (globalBusy?.debateName === project.debateName) return 'generating';
    return project.videoExists ? 'ready' : 'draft';
  };
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.topic.toLowerCase().includes(projectSearch.trim().toLowerCase());
    const matchesStatus = projectFilter === 'all' || statusForProject(project) === projectFilter;
    return matchesSearch && matchesStatus;
  });
  const selectedSubtitleIndex = Math.max(0, editScenes.findIndex(scene => scene.id === selectedSubtitleId));
  const selectedSubtitle = editScenes[selectedSubtitleIndex] ?? null;
  const selectedVisualIndex = visualScenes.findIndex(scene => scene.id === selectedVisualId);
  const selectedVisual = selectedVisualIndex >= 0 ? visualScenes[selectedVisualIndex] : visualScenes[0] ?? null;
  const activeVisualIndex = selectedVisualIndex >= 0 ? selectedVisualIndex : selectedVisual ? 0 : -1;
  const usageProjects = Array.from(usageCalls.reduce((groups, usageCall) => {
    const id = usageCall.projectId || 'studio-tools';
    const existing = groups.get(id) ?? {
      id,
      title: usageCall.projectTitle || (id === 'studio-tools' ? 'Studio tools' : id),
      calls: [],
      totalTokens: 0,
      characters: 0,
      costUsd: 0,
      costInr: 0,
      lastActivityAt: usageCall.createdAt,
    } satisfies ProjectUsageGroup;
    existing.calls.push(usageCall);
    existing.totalTokens += usageCall.totalTokens;
    existing.characters += usageCall.characters;
    existing.costUsd += usageCall.costUsd;
    existing.costInr += usageCall.costInr;
    groups.set(id, existing);
    return groups;
  }, new Map<string, ProjectUsageGroup>()).values());

  const creating = homeView === 'create' && (!debate || workspaceSection === 'setup');
  const editingProject = !!debate && !creating;
  const reviewingCopy = !!debate && workspaceSection === 'storyboard';
  const editingVisuals = !!debate && workspaceSection === 'visuals';
  const renderingVideo = !!debate && workspaceSection === 'video';
  const publishingProject = !!debate && workspaceSection === 'publish';
  const projectsHome = !debate && homeView === 'projects';
  const logsHome = !debate && homeView === 'logs';
  const youtubeOutputSelected = cfg.outputType === 'youtube';
  const reelsOutputSelected = cfg.outputType === 'short' || cfg.extractReels;
  const generatePlanStages = ([
    { id: 'script', title: 'Script', description: 'Write and structure the narration', badge: 'AI' },
    { id: 'metadata', title: 'Metadata', description: 'Create titles, descriptions, hashtags and captions', badge: 'AI' },
    { id: 'visuals', title: 'Pictures', description: 'Plan scenes and find matching stock images', badge: 'AI + Pexels' },
    { id: 'thumbnail', title: 'Thumbnail', description: 'Create the YouTube cover image', badge: 'Local' },
    { id: 'audio', title: 'Narration audio', description: 'Generate speech for every subtitle', badge: 'AI' },
    { id: 'video', title: cfg.outputType === 'short' ? 'Vertical video' : 'Main video', description: 'Render the finished video on this computer', badge: 'Local' },
    { id: 'shorts', title: 'Shorts / Reels', description: 'Extract and render vertical clips', badge: 'Local' },
    { id: 'publish', title: 'Publish', description: 'Upload to your connected social accounts', badge: 'Optional' },
  ] satisfies Array<{ id: GeneratePlanStage; title: string; description: string; badge: string }>).filter(stage => {
    if (generatePlanSource === 'script' && stage.id === 'script') return false;
    if (generatePlanSource === 'visuals' && (stage.id === 'script' || stage.id === 'metadata')) return false;
    if (stage.id === 'visuals' && cfg.visualMode !== 'infographic') return false;
    if (stage.id === 'thumbnail' && cfg.outputType !== 'youtube') return false;
    if (stage.id === 'shorts' && !(cfg.outputType === 'youtube' && cfg.extractReels)) return false;
    return true;
  });

  return (
    <main className={`app-shell theme-${theme} ${projectsHome || logsHome ? 'projects-mode' : ''} ${logsHome ? 'logs-mode' : ''} ${creating ? 'creation-mode' : ''} ${editingProject ? 'project-mode' : ''} ${editingVisuals ? 'assets-mode' : ''} ${reviewingCopy ? 'review-mode' : ''} ${renderingVideo ? 'render-mode' : ''} ${publishingProject ? 'publish-mode' : ''}`}>
      {generatePlanSource && (
        <div className="generate-plan-backdrop" role="presentation" onMouseDown={() => setGeneratePlanSource(null)}>
          <section className="generate-plan-modal" role="dialog" aria-modal="true" aria-labelledby="generate-plan-title" onMouseDown={event => event.stopPropagation()}>
            <header>
              <span><Icon name="sparkles" size={20} /></span>
              <div><h2 id="generate-plan-title">Choose what to generate</h2><p>Everything is selected by default except publishing.</p></div>
              <button type="button" aria-label="Close" onClick={() => setGeneratePlanSource(null)}>×</button>
            </header>
            <div className="generate-plan-list">
              {generatePlanStages.map(stage => {
                const required = generatePlanSource === 'create' && stage.id === 'script';
                return <label key={stage.id} className={generatePlanSelection[stage.id] ? 'selected' : ''}>
                  <input type="checkbox" checked={generatePlanSelection[stage.id]} disabled={required} onChange={event => setGeneratePlanSelection(current => ({ ...current, [stage.id]: event.target.checked }))} />
                  <span className="generate-plan-check"><Icon name="check" size={13} /></span>
                  <span className="generate-plan-copy"><strong>{stage.title}{required ? ' · required' : ''}</strong><small>{stage.description}</small></span>
                  <em>{stage.badge}</em>
                </label>;
              })}
            </div>
            <footer>
              <button type="button" className="generate-plan-cancel" onClick={() => setGeneratePlanSource(null)}>Cancel</button>
              <button type="button" className="generate-plan-start" onClick={executeGeneratePlan} disabled={!generatePlanStages.some(stage => generatePlanSelection[stage.id])}><Icon name="sparkles" size={16} /> Start generation</button>
            </footer>
          </section>
        </div>
      )}
      {!creating && !editingProject && <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <span><b>KZR</b><small>Creator Studio</small></span>
        </div>
        <span className="sidebar-label">Workspace</span>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={!debate && homeView === 'projects' ? 'nav-item active' : 'nav-item'} onClick={showProjects} disabled={working}>
            <Icon name="folder" size={17} /> Projects
          </button>
          <button className={!debate && homeView === 'logs' ? 'nav-item active' : 'nav-item'} onClick={showLogs} disabled={working}>
            <Icon name="list" size={17} /> Logs
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Local workspace
          <small>Private on this computer</small>
        </div>
      </aside>}
      <div className={`workspace ${creating ? 'creation-workspace' : ''} ${editingProject ? 'project-workspace' : ''} ${editingVisuals ? 'assets-workspace' : ''} ${renderingVideo ? 'render-workspace' : ''} ${publishingProject ? 'publish-workspace' : ''}`}>
      {creating && (
        <header className="creation-app-header">
          <button type="button" className="creation-brand" onClick={showProjects} disabled={working}>
            <BrandMark />
            <strong>KZR CREATOR STUDIO</strong>
          </button>
          <div className="creation-project-name"><strong>{debate?.topic || 'Untitled project'}</strong><small>{debate ? 'Existing project' : creationDraftSaved ? 'Saved locally' : 'New project'}</small></div>
          <div className="creation-header-actions">
            <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
            {!debate && <button className="save-draft-button" type="button" onClick={saveCreationDraft} disabled={working}>
              <Icon name="save" size={16} /> {creationDraftSaved ? 'Draft saved' : 'Save draft'}
            </button>}
          </div>
        </header>
      )}

      {renderElsewhere && (
        <div className="busy-banner">
          A render is in progress on <strong>{globalBusy!.debateName}</strong> ({globalBusy!.kind} · {globalBusy!.stage}).
          Video and reel buttons are paused until it finishes.
        </div>
      )}

      {job && (
        <div className="job-progress" role="status">
          <span className="job-spinner" aria-hidden="true" />
          <div>
            <strong>{job.stage === 'publishing' ? 'Publishing' : `Working on ${job.stage}`}…{job.attempt && job.attempt > 1 ? ` (attempt ${job.attempt})` : ''}</strong>
            {job.logs?.length ? <p>{job.logs[job.logs.length - 1]}</p> : <p>This can take a few minutes. You can keep this tab open.</p>}
          </div>
        </div>
      )}

      {working && !job && activityMessage && (
        <div className="operation-progress" role="status" aria-live="polite">
          <span className="job-spinner" aria-hidden="true" />
          <div><strong>{activityMessage}</strong><p>Please keep this page open. The next step will appear automatically.</p></div>
        </div>
      )}

      {!debate && homeView === 'projects' && (
        <section className="projects-screen" id="project-library">
          <header className="projects-header">
            <div>
              <span className="projects-eyebrow">Creative workspace</span>
              <h1>Your projects</h1>
              <p>Continue creating, review a draft, or start something new.</p>
            </div>
            <div className="projects-toolbar">
              <label className="project-search">
                <Icon name="search" size={17} />
                <input value={projectSearch} onChange={event => setProjectSearch(event.target.value)} placeholder="Search projects…" aria-label="Search projects" />
              </label>
              <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
              <button className="projects-new-button" type="button" onClick={startNew}><Icon name="plus" size={17} /> New video</button>
            </div>
          </header>

          <div className="projects-control-bar">
            <nav className="project-filters" aria-label="Filter projects">
              {([
                ['all', 'All'],
                ['draft', 'Drafts'],
                ['generating', 'Generating'],
                ['ready', 'Ready'],
              ] as Array<[ProjectFilter, string]>).map(([filter, label]) => {
                const count = filter === 'all' ? projects.length : projects.filter(project => statusForProject(project) === filter).length;
                return <button type="button" key={filter} className={projectFilter === filter ? 'active' : ''} onClick={() => setProjectFilter(filter)}>{label}<span>{count}</span></button>;
              })}
            </nav>
            <span className="projects-view-label"><Icon name="grid" size={15} /> Grid view</span>
          </div>

          {filteredProjects.length === 0 && projectSearch.trim() && (
            <div className="projects-empty"><Icon name="search" size={22} /><strong>No matching projects</strong><p>Try another title or clear the current filter.</p></div>
          )}

          <div className="project-library-grid">
            {filteredProjects.map(project => {
              const status = statusForProject(project);
              return (
                <button className="library-project-card" type="button" key={project.debateName} onClick={() => openProject(project.debateName)} disabled={working}>
                  <span className="library-project-visual">
                    {project.thumbnailExists
                      ? <img src={`/api/debate/${project.debateName}/thumbnail?t=${project.updatedAt}`} alt="" />
                      : <span className="project-placeholder"><Icon name={project.contentMode === 'debate' ? 'users' : 'play'} size={28} /></span>}
                    <span className="project-format-badge"><Icon name={project.contentMode === 'debate' ? 'users' : 'play'} size={13} />{project.contentMode === 'debate' ? 'Debate' : 'Explainer'}</span>
                    <span className={`project-status-pill ${status}`}>
                      {status === 'generating' && <span className="mini-spinner" />}
                      {status === 'ready' && <Icon name="check" size={13} />}
                      {status === 'generating' ? 'Generating' : status === 'ready' ? 'Ready' : 'Draft'}
                    </span>
                  </span>
                  <span className="library-project-body">
                    <small>{project.debateName}</small>
                    <strong>{project.topic}</strong>
                    <span className="library-project-meta"><span>{project.scenesCount} scenes</span><span>{project.reelsCount} reels</span><span>{formatProjectDate(project.updatedAt)}</span></span>
                    <span className="project-open"><span>Open project</span><Icon name="arrow-right" size={15} /></span>
                  </span>
                </button>
              );
            })}
            {projectFilter === 'all' && !projectSearch.trim() && (
              <button type="button" className="create-project-card" onClick={startNew}>
                <span className="create-project-icon"><Icon name="plus" size={24} /></span>
                <strong>Start a new video</strong>
                <span>Turn one idea into a finished video and ready-to-share reels.</span>
              </button>
            )}
          </div>
        </section>
      )}

      {logsHome && (
        <section className="logs-screen" id="activity-logs">
          <header className="projects-header logs-header">
            <div>
              <span className="projects-eyebrow">Local activity</span>
              <h1>Logs &amp; usage</h1>
              <p>Review every project’s AI activities, token usage and estimated cost.</p>
            </div>
            <div className="projects-toolbar">
              <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
              <button className="logs-refresh-button" type="button" onClick={() => void refreshLogs()} disabled={logsLoading}>
                <Icon name="clock" size={16} /> {logsLoading ? 'Refreshing…' : 'Refresh logs'}
              </button>
            </div>
          </header>

          <div className="logs-summary-grid" aria-label="AI usage summary">
            <article>
              <span>AI calls</span>
              <strong>{formatTokens(usage?.total.calls ?? 0)}</strong>
              <small>{usage?.lastCall ? `Last ${formatLogDate(usage.lastCall.createdAt)}` : 'No calls recorded'}</small>
            </article>
            <article>
              <span>Total tokens</span>
              <strong>{formatTokens(usage?.total.totalTokens ?? 0)}</strong>
              <small>{formatTokens(usage?.total.characters ?? 0)} speech characters</small>
            </article>
            <article>
              <span>Estimated USD</span>
              <strong>{formatUsageMoney(usage?.total.costUsd ?? 0, 'USD')}</strong>
              <small>Across all recorded calls</small>
            </article>
            <article>
              <span>Estimated INR</span>
              <strong>{formatUsageMoney(usage?.total.costInr ?? 0, 'INR')}</strong>
              <small>Rate: ₹{usage?.usdToInr ?? 0} per USD</small>
            </article>
          </div>

          <section className="logs-panel project-usage-panel">
            <header>
              <div><h2>Project usage</h2><p>AI activities, tokens and estimated cost grouped by project.</p></div>
              <span>{usageProjects.length} projects</span>
            </header>
            {logsLoading && usageProjects.length === 0 ? (
              <div className="logs-empty"><span className="job-spinner" /><strong>Loading usage…</strong></div>
            ) : usageProjects.length === 0 ? (
              <div className="logs-empty"><Icon name="sparkles" size={22} /><strong>No project usage recorded</strong><p>Script, metadata, visual planning and narration activities will appear here.</p></div>
            ) : (
              <div className="project-usage-list">
                {usageProjects.map(projectUsage => (
                  <article className="project-usage-card" key={projectUsage.id}>
                    <header>
                      <div><strong>{projectUsage.title}</strong><small>Last activity {formatLogDate(projectUsage.lastActivityAt)}</small></div>
                      <div className="project-usage-totals">
                        <span><small>Usage</small><strong>{projectUsage.totalTokens ? `${formatTokens(projectUsage.totalTokens)} tokens` : `${formatTokens(projectUsage.characters)} chars`}</strong></span>
                        <span><small>Cost</small><strong>{formatUsageMoney(projectUsage.costUsd, 'USD')} · {formatUsageMoney(projectUsage.costInr, 'INR')}</strong></span>
                        <span><small>Activities</small><strong>{projectUsage.calls.length}</strong></span>
                      </div>
                    </header>
                    <div className="usage-log-table" role="table" aria-label={`${projectUsage.title} AI usage`}>
                      <div className="usage-log-heading" role="row">
                        <span>Activity</span><span>Usage</span><span>Cost</span><span>Time</span>
                      </div>
                      {projectUsage.calls.map(callEntry => (
                        <div className="usage-log-row" role="row" key={callEntry.id}>
                          <span><strong>{readableOperation(callEntry.operation)}</strong><small>{callEntry.model}</small></span>
                          <span><strong>{callEntry.totalTokens ? `${formatTokens(callEntry.totalTokens)} tokens` : `${formatTokens(callEntry.characters)} chars`}</strong><small>{callEntry.totalTokens ? `${formatTokens(callEntry.inputTokens)} in · ${formatTokens(callEntry.outputTokens)} out` : 'Speech generation'}</small></span>
                          <span><strong>{formatUsageMoney(callEntry.costUsd, 'USD')}</strong><small>{formatUsageMoney(callEntry.costInr, 'INR')}</small></span>
                          <time>{formatLogDate(callEntry.createdAt)}</time>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <footer>Costs are estimates based on the locally configured model rates. Exchange rate reference: {usage?.exchangeRateAsOf ?? 'not available'}.</footer>
          </section>
        </section>
      )}

      {creating && (
        <section className="creation-page">
          <aside className="creation-step-sidebar" aria-label="Creation steps">
            <ol>
              <li className="active"><span>1</span><button type="button" aria-current="step"><strong>Provide details</strong><small>Define your video</small></button></li>
              <li><span>2</span><button type="button" onClick={returnToReviewedScript} disabled={!debate || working}><strong>Review script</strong><small>Edit the narration</small></button></li>
              <li><span>3</span><button type="button" onClick={() => setWorkspaceSection('visuals')} disabled={!debate || working}><strong>Create visuals</strong><small>Choose your pictures</small></button></li>
              <li><span>4</span><button type="button" onClick={openRenderScreen} disabled={!debate || working || !renderEntryReady}><strong>Render videos</strong><small>{debate && !renderEntryReady ? 'Generate audio first' : 'Build every output'}</small></button></li>
              <li><span>5</span><button type="button" onClick={() => setWorkspaceSection('publish')} disabled={!debate || working || !completePackReady}><strong>Download &amp; publish</strong><small>{debate && !completePackReady ? 'Render videos first' : 'Share your work'}</small></button></li>
            </ol>
          </aside>

          <div className="creation-main">
            <div className="creation-title">
              <h1>{debate ? 'Video setup' : 'Create a new video'}</h1>
              <p>{debate ? 'Review the original brief and creative direction for this project.' : 'Provide the essentials. You can change everything later.'}</p>
            </div>

            <div className="creation-studio">
              <section className="creation-brief-column">
                <div className="creation-section-title creation-section-title-with-action">
                  <span><Icon name="folder" size={17} /></span>
                  <h2>Project brief</h2>
                  {!debate && <button type="button" className="generate-brief-button" onClick={generateProjectBrief} disabled={working} title="Invent a title, context and thumbnail hook for the selected format"><Icon name="sparkles" size={15} /> {busy === 'brief' ? 'Generating…' : 'Auto-generate brief'}</button>}
                </div>
                <div className="creation-field">
                  <label htmlFor="topic">Title or topic</label>
                  <div className="counted-field">
                    <input id="topic" maxLength={120} value={topic} onChange={e => { setTopic(e.target.value); setError(''); setCreationDraftSaved(false); }} placeholder="e.g. How Ancient Rome shaped the modern world" disabled={working || !!debate} />
                    <small>{topic.length}/120</small>
                  </div>
                </div>
                <div className="creation-field">
                  <label htmlFor="context">Context</label>
                  <div className="counted-field textarea-field">
                    <textarea id="context" maxLength={1000} value={context} onChange={e => { setContext(e.target.value); setError(''); setCreationDraftSaved(false); }} placeholder="Describe the topic, key messages, audience and anything the script should include…" disabled={working || !!debate} />
                    <small>{context.length}/1000</small>
                  </div>
                </div>
                <div className="creation-field">
                  <label htmlFor="thumbnail-hook">Thumbnail hook</label>
                  <div className="counted-field">
                    <input id="thumbnail-hook" maxLength={80} value={cfg.thumbnailHook} onChange={e => { setCfg(current => ({ ...current, thumbnailHook: e.target.value })); setCreationDraftSaved(false); }} placeholder="e.g. Rome still shapes our cities" disabled={working || !!debate} />
                    <small>{cfg.thumbnailHook.length}/80</small>
                  </div>
                </div>
                {!debate && error && <div className="brief-feedback" role="alert"><span>{error}</span></div>}
                <div className={`draft-state ${debate || creationDraftSaved ? 'saved' : ''}`}><Icon name="check" size={14} />{debate ? 'Settings used to create this project' : creationDraftSaved ? 'Draft saved locally' : 'Save the draft to keep these choices'}</div>
              </section>

              <section className="creation-direction-column">
                <div className="creation-section-title"><span><Icon name="sparkles" size={17} /></span><h2>Creative direction</h2></div>

                <h3 className="studio-label">Format</h3>
                <div className="creation-choice-grid image-choice-grid">
                  <button type="button" aria-pressed={cfg.contentMode === 'narrated-explainer'} className={`studio-image-choice choice-explainer ${cfg.contentMode === 'narrated-explainer' ? 'selected' : ''}`} disabled={working || !!debate} onClick={() => { setCfg(c => ({ ...c, contentMode: 'narrated-explainer', visualMode: 'infographic' })); setCreationDraftSaved(false); }}>
                    <span className="choice-copy"><Icon name="monitor" size={22} /><span><strong>Explainer</strong><small>Narration with stock visuals</small></span></span>
                  </button>
                  <button type="button" aria-pressed={cfg.contentMode === 'debate'} className={`studio-image-choice choice-debate ${cfg.contentMode === 'debate' ? 'selected' : ''}`} disabled={working || !!debate} onClick={() => { setCfg(c => ({ ...c, contentMode: 'debate', visualMode: 'debate' })); setCreationDraftSaved(false); }}>
                    <span className="choice-copy"><Icon name="users" size={22} /><span><strong>Debate</strong><small>Two hosts, opposing views</small></span></span>
                  </button>
                </div>

                <h3 className="studio-label">Output type <small>Select one or both</small></h3>
                <div className="creation-choice-grid image-choice-grid">
                  <button type="button" aria-pressed={youtubeOutputSelected} className={`studio-image-choice choice-youtube ${youtubeOutputSelected ? 'selected' : ''}`} disabled={working || !!debate} onClick={() => toggleCreationOutput('youtube')}>
                    <span className="choice-copy"><Icon name="monitor" size={22} /><span><strong>YouTube video</strong><small>16:9 landscape</small></span></span>
                  </button>
                  <button type="button" aria-pressed={reelsOutputSelected} className={`studio-image-choice choice-reels ${reelsOutputSelected ? 'selected' : ''}`} disabled={working || !!debate} onClick={() => toggleCreationOutput('reels')}>
                    <span className="choice-copy"><Icon name="smartphone" size={22} /><span><strong>Reels / Shorts</strong><small>9:16 vertical</small></span></span>
                  </button>
                </div>

                <div className="length-and-reels">
                  <label htmlFor="video-length">Video length</label>
                  <div className="length-field">
                    <input id="video-length" type="number" min={youtubeOutputSelected ? 0.25 : REEL_DURATION_SECONDS} max={youtubeOutputSelected ? 60 : REEL_DURATION_SECONDS} step={youtubeOutputSelected ? 0.25 : 1} value={youtubeOutputSelected ? cfg.videoLengthMinutes : REEL_DURATION_SECONDS} onChange={e => { if (youtubeOutputSelected) setCfg(c => ({ ...c, videoLengthMinutes: Number(e.target.value) })); setCreationDraftSaved(false); }} disabled={working || !youtubeOutputSelected || !!debate} />
                    <span>{youtubeOutputSelected ? 'minutes' : 'seconds'}</span>
                  </div>
                  <small>{youtubeOutputSelected ? 'Choose any YouTube duration. Reels stay between 50–53 seconds.' : 'Reels use a fixed 52-second duration.'}</small>
                </div>

                {youtubeOutputSelected && reelsOutputSelected && (
                  <div className="creation-info"><Icon name="sparkles" size={16} /><span>Reels will be extracted automatically from the finished YouTube video.</span></div>
                )}
              </section>

              <aside className="creation-output-plan">
                <h2>Output plan</h2>
                <div className="output-plan-list">
                  {youtubeOutputSelected && <div><span><Icon name="monitor" size={20} /></span><p><strong>YouTube video</strong><small>{cfg.videoLengthMinutes} minutes</small></p></div>}
                  {reelsOutputSelected && <div><span><Icon name="smartphone" size={20} /></span><p><strong>Reels / Shorts</strong><small>{youtubeOutputSelected ? 'Automatic extraction' : `${REEL_DURATION_SECONDS} seconds`}</small></p></div>}
                  <div><span><Icon name="play" size={20} /></span><p><strong>Format</strong><small>{cfg.contentMode === 'narrated-explainer' ? 'Explainer' : 'Debate'}</small></p></div>
                </div>
                <p className="output-plan-note">You can review the script and visuals before rendering.</p>
              </aside>
            </div>

            <footer className="creation-footer">
              <div className="creation-final-actions">
                <div className="creation-buttons">
                  <button type="button" className="next-step-button" onClick={debate ? returnToReviewedScript : generateNextStep} disabled={working || renderElsewhere}>{debate ? <>Back to script <Icon name="arrow-right" size={17} /></> : <><Icon name="sparkles" size={17} /> {busy === 'script' ? 'Generating script…' : 'Next: Generate script'}</>}</button>
                  <button type="button" className="generate-all-button" onClick={() => openGeneratePlan(debate ? 'script' : 'create')} disabled={working || renderElsewhere}><Icon name="sparkles" size={17} /> Generate all</button>
                </div>
                <small>Choose exactly which remaining steps to run.</small>
              </div>
            </footer>
          </div>
        </section>
      )}

      {error && !creating && <div className="error">{error}</div>}

      {debate && (
        <>
          {workspaceSection === 'storyboard' && (
          <section className="copy-review-screen">
            <header className="copy-review-header">
              <button type="button" className="copy-review-brand" onClick={showProjects} disabled={working}>
                <BrandMark />
                <strong>KZR CREATOR STUDIO</strong>
              </button>
              <div className="copy-review-project"><span>{debate.debateName}</span><strong>{debate.topic}</strong></div>
              <div className="copy-review-header-actions">
                <span className={sceneEditsChanged || metadataChanged ? 'unsaved-indicator' : 'saved-indicator'}><Icon name="check" size={13} /> {sceneEditsChanged || metadataChanged ? 'Changes not saved' : 'All changes saved'}</span>
                <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
              </div>
            </header>

            <div className="copy-review-layout">
              <aside className="copy-step-sidebar" aria-label="Project steps">
                <ol>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={returnToVideoSetup}><strong>Video setup</strong><small>Brief and direction</small></button></li>
                  <li className="active"><span>2</span><button type="button"><strong>Script &amp; metadata</strong><small>Review your copy</small></button></li>
                  <li><span>3</span><button type="button" onClick={() => setWorkspaceSection('visuals')}><strong>Visuals</strong><small>Pictures and audio</small></button></li>
                  <li><span>4</span><button type="button" onClick={openRenderScreen} disabled={working || !renderEntryReady}><strong>Render</strong><small>{audioReady ? 'Create the videos' : 'Generate audio first'}</small></button></li>
                  <li><span>5</span><button type="button" onClick={() => setWorkspaceSection('publish')} disabled={working || !completePackReady}><strong>Publish</strong><small>{completePackReady ? 'Download or share' : 'Render videos first'}</small></button></li>
                </ol>
              </aside>

              <div className="copy-review-workspace">
                <nav className="copy-review-tabs" aria-label="Review content">
                  <button type="button" className={reviewTab === 'script' ? 'active' : ''} onClick={() => setReviewTab('script')}>Script <span>{editScenes.length} lines</span></button>
                  <button type="button" className={reviewTab === 'metadata' ? 'active' : ''} onClick={() => setReviewTab('metadata')}>Metadata <span>{editMetadataFields ? 'Ready' : 'Pending'}</span></button>
                </nav>

                {reviewTab === 'script' ? (
                  <section className="document-editor-panel">
                    <header>
                      <div><span className="eyebrow">Generated script</span><h2>Review the complete narration</h2><p>Edit naturally in one document. Scene headings organize the story; every following line becomes a subtitle.</p></div>
                      <button type="button" className="btn-secondary" onClick={appendDocumentScene} disabled={working}><Icon name="plus" size={14} /> Add scene</button>
                    </header>
                    <div className="document-editor-toolbar">
                      <span>{scriptSections.length} scenes</span><span>{editScenes.length} subtitles</span><span>{totalWords} words</span><span>~{formatEditorTime(estimatedSeconds)}</span>
                    </div>
                    <textarea
                      className="script-document-editor"
                      value={scriptDocument}
                      onChange={event => updateScriptDocument(event.target.value)}
                      disabled={working}
                      spellCheck
                      aria-label="Complete video script"
                    />
                    <div className="document-editor-help"><span><strong>Scene heading:</strong> SCENE 1 — Opening</span><span>{cfg.contentMode === 'debate' ? <><strong>Speakers:</strong> start lines with A: or B:</> : 'Each non-empty line becomes one subtitle.'}</span></div>
                  </section>
                ) : (
                  <section className="review-metadata-panel">
                    <header>
                      <div><span className="eyebrow">Publishing copy</span><h2>Metadata</h2><p>Prepare the copy that travels with the main video and short-form clips.</p></div>
                      {editMetadataFields && <span className="metadata-ready"><Icon name="check" size={13} /> Generated</span>}
                    </header>
                    {!editMetadataFields ? (
                      <div className="metadata-empty compact"><Icon name="sparkles" size={20} /><strong>Metadata has not been generated</strong><p>Create titles, descriptions, hashtags and captions from the reviewed script.</p><button type="button" onClick={generateMetadata} disabled={working}><Icon name="sparkles" size={15} /> {busy === 'metadata' ? 'Generating…' : 'Generate metadata'}</button></div>
                    ) : <>
                      <nav className="metadata-platform-tabs" aria-label="Metadata platform">
                        <button type="button" className={metadataPlatform === 'youtube' ? 'active' : ''} onClick={() => setMetadataPlatform('youtube')}><Icon name="monitor" size={16} /> YouTube</button>
                        <button type="button" className={metadataPlatform === 'reels' ? 'active' : ''} onClick={() => setMetadataPlatform('reels')}><Icon name="smartphone" size={16} /> Reels &amp; Shorts</button>
                      </nav>

                      {metadataPlatform === 'youtube' ? (
                        <div className="youtube-metadata-editor">
                          <label htmlFor="review-youtube-title">Video title <span>{editMetadataFields.youtube.title.length}/120</span></label>
                          <input id="review-youtube-title" value={editMetadataFields.youtube.title} readOnly />
                          <small>The title remains exactly as entered in the project brief.</small>
                          <label htmlFor="review-youtube-description">Description <span>{editMetadataFields.youtube.description.length}/5000</span></label>
                          <textarea id="review-youtube-description" rows={9} maxLength={5000} value={editMetadataFields.youtube.description} onChange={event => updateYoutubeMetadata('description', event.target.value)} disabled={working} />
                          <label htmlFor="review-youtube-tags">Hashtags <span>{editMetadataFields.youtube.hashtags.length}/8–12</span></label>
                          <input id="review-youtube-tags" value={editMetadataFields.youtube.hashtags.join(' ')} onChange={event => updateHashtags(event.target.value)} disabled={working} />
                          <label htmlFor="review-thumbnail-hook">Thumbnail hook <span>{editMetadataFields.thumbnailHook.length}/80</span></label>
                          <input id="review-thumbnail-hook" maxLength={80} value={editMetadataFields.thumbnailHook} onChange={event => setEditMetadataFields(current => current ? { ...current, thumbnailHook: event.target.value } : current)} disabled={working} />
                          <div className="visuals-later-note"><Icon name="image" size={17} /><span>The thumbnail preview will appear in the Visuals step after pictures are generated.</span></div>
                        </div>
                      ) : (
                        <div className="reels-metadata-editor">
                          <div className="shared-caption-setting"><span><Icon name="check" size={14} /></span><div><strong>Use the same captions for Instagram Reels and YouTube Shorts</strong><small>You can still customize every reel below.</small></div></div>
                          <div className="visuals-later-note"><Icon name="image" size={17} /><span>Visual previews will appear after pictures and thumbnails are generated.</span></div>
                          <div className="reel-caption-list">
                            {editMetadataFields.reels.map((reel, reelIndex) => {
                              const parsed = splitCaption(reel.caption);
                              const sectionStart = scriptSections.length ? Math.floor(reelIndex * scriptSections.length / editMetadataFields.reels.length) + 1 : 0;
                              const sectionEnd = scriptSections.length ? Math.max(sectionStart, Math.floor((reelIndex + 1) * scriptSections.length / editMetadataFields.reels.length)) : 0;
                              return <article key={reel.part} className="reel-caption-card">
                                <header><div><span>Reel {reel.part}</span><strong>{sectionStart ? `Scenes ${sectionStart}–${sectionEnd}` : 'Source scenes pending'}</strong></div><small>~{REEL_DURATION_SECONDS} sec</small></header>
                                <label htmlFor={`review-reel-${reel.part}`}>Caption <span>{reel.caption.length}/2200</span></label>
                                <textarea id={`review-reel-${reel.part}`} rows={6} maxLength={2200} value={parsed.body} onChange={event => updateReelCaptionBody(reel.part, event.target.value)} disabled={working} />
                                <label>Hashtags</label>
                                <div className="reel-hashtag-editor">
                                  {parsed.hashtags.map(tag => <button type="button" key={tag} onClick={() => removeReelHashtag(reel.part, tag)} disabled={working}>{tag}<span>×</span></button>)}
                                  <input placeholder="Add hashtag + Enter" disabled={working} onKeyDown={event => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    addReelHashtag(reel.part, event.currentTarget.value);
                                    event.currentTarget.value = '';
                                  }} />
                                </div>
                              </article>;
                            })}
                          </div>
                        </div>
                      )}
                    </>}
                  </section>
                )}

                <footer className="copy-review-footer">
                  <button type="button" className="copy-back-button" onClick={returnToVideoSetup} disabled={working}>Back</button>
                  <span className={hasInvalidScenes || metadataInvalid ? 'save-warning' : sceneEditsChanged || metadataChanged ? 'unsaved-indicator' : 'saved-indicator'}>
                    {hasInvalidScenes ? 'Script needs at least one narration line' : metadataInvalid ? 'Complete the metadata fields' : sceneEditsChanged || metadataChanged ? 'Unsaved changes' : <><Icon name="check" size={13} /> Ready to continue</>}
                  </span>
                  <div>
                    <button type="button" className="btn-secondary" onClick={saveReviewChanges} disabled={working || hasInvalidScenes || metadataInvalid || (!sceneEditsChanged && !metadataChanged)}>{busy === 'save-review' ? 'Saving…' : 'Save changes'}</button>
                    <button type="button" className="btn-secondary generate-review-all" onClick={() => openGeneratePlan('script')} disabled={working || renderElsewhere || hasInvalidScenes || metadataInvalid}><Icon name="sparkles" size={15} /> Generate all</button>
                    <button type="button" onClick={continueToVisuals} disabled={working || hasInvalidScenes || metadataInvalid}>{busy === 'continue-visuals' ? 'Saving…' : <>Next: Create visuals <Icon name="arrow-right" size={15} /></>}</button>
                  </div>
                </footer>
              </div>
            </div>
          </section>
          )}

          {workspaceSection === 'visuals' && (
          <section className="assets-screen">
            <header className="copy-review-header assets-header">
              <button type="button" className="copy-review-brand" onClick={showProjects} disabled={working}>
                <BrandMark /><strong>KZR CREATOR STUDIO</strong>
              </button>
              <div className="copy-review-project"><span>{debate.debateName}</span><strong>{debate.topic}</strong></div>
              <div className="copy-review-header-actions">
                <span className={assetsReady ? 'saved-indicator' : 'unsaved-indicator'}>{assetsReady ? <><Icon name="check" size={13} /> Assets ready</> : 'Assets need preparation'}</span>
                <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
              </div>
            </header>

            <div className="copy-review-layout assets-layout">
              <aside className="copy-step-sidebar" aria-label="Project steps">
                <ol>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={returnToVideoSetup}><strong>Video setup</strong><small>Brief and direction</small></button></li>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={() => setWorkspaceSection('storyboard')}><strong>Script &amp; metadata</strong><small>Copy reviewed</small></button></li>
                  <li className="active"><span>3</span><button type="button"><strong>Visuals &amp; audio</strong><small>Prepare assets</small></button></li>
                  <li><span>4</span><button type="button" onClick={openRenderScreen} disabled={working || !renderEntryReady}><strong>Render</strong><small>{audioReady ? 'Create the videos' : 'Generate audio first'}</small></button></li>
                  <li><span>5</span><button type="button" onClick={() => setWorkspaceSection('publish')} disabled={working || !completePackReady}><strong>Publish</strong><small>{completePackReady ? 'Download or share' : 'Render videos first'}</small></button></li>
                </ol>
              </aside>

              <div className="assets-main">
                <header className="assets-titlebar">
                  <div><span className="eyebrow">Step 3</span><h1>Visuals &amp; audio</h1><p>Prepare the assets once. Rendering in the next step uses no OpenAI calls.</p></div>
                  <button type="button" onClick={prepareMissingAssets} disabled={working || renderElsewhere || assetsReady}>{busy === 'prepare-assets' ? 'Preparing assets…' : assetsReady ? <><Icon name="check" size={15} /> All assets ready</> : <><Icon name="sparkles" size={15} /> Prepare missing assets</>}</button>
                </header>

                <div className="asset-status-strip">
                  <div className={visualsReady ? 'ready' : ''}><span><Icon name="image" size={17} /></span><p><strong>Pictures</strong><small>{visualsReady ? `${visualScenes.length || scriptSections.length} ready` : 'Not generated'}</small></p>{visualsReady && <Icon name="check" size={15} />}</div>
                  <div className={thumbnailReady ? 'ready' : ''}><span><Icon name="monitor" size={17} /></span><p><strong>Thumbnail</strong><small>{thumbnailReady ? 'Ready' : 'Not generated'}</small></p>{thumbnailReady && <Icon name="check" size={15} />}</div>
                  <div className={audioReady ? 'ready' : ''}><span><Icon name="play" size={17} /></span><p><strong>Audio</strong><small>{audioReady ? `${audioSegments.length} clips` : 'Not generated'}</small></p>{audioReady && <Icon name="check" size={15} />}</div>
                </div>

                <section className="asset-panel pictures-asset-panel">
                  <header><div><span className="asset-number">01</span><div><h2>{cfg.visualMode === 'infographic' ? 'Scene pictures' : 'Character visuals'}</h2><p>{cfg.visualMode === 'infographic' ? 'One picture may cover several subtitles. Adjust its range or replace it below.' : 'The selected character layout is generated directly during rendering.'}</p></div></div>{cfg.visualMode === 'infographic' && <button type="button" className="asset-secondary-button" onClick={generateVisuals} disabled={!visualsConfigured || working || renderElsewhere}><Icon name="sparkles" size={15} /> {visualScenes.length ? 'Regenerate pictures' : 'Generate pictures'}</button>}</header>

                  {cfg.visualMode !== 'infographic' ? (
                    <div className="character-visual-note"><Icon name="users" size={24} /><div><strong>Character studio selected</strong><p>Speaker positions and backgrounds are handled automatically. No stock pictures are required.</p></div></div>
                  ) : visualScenes.length === 0 ? (
                    <div className="asset-empty-state"><Icon name="image" size={28} /><strong>No scene pictures yet</strong><p>Generate pictures to create a visual plan from the reviewed script.</p><button type="button" onClick={generateVisuals} disabled={!visualsConfigured || working}>{visualsConfigured && <Icon name="sparkles" size={15} />} {visualsConfigured ? 'Generate pictures' : 'Add a Pexels key first'}</button></div>
                  ) : (
                    <div className="asset-picture-grid">
                      {visualScenes.map((visual, visualIndex) => {
                        const startIndex = visual.lineStart ?? 0;
                        const endIndex = visual.lineEnd ?? startIndex;
                        return <article className="asset-picture-card" key={visual.id}>
                          <div className="asset-picture-preview">
                            {visual.imagePath ? <img src={`/api/debate/${name}/visuals/${visual.id}/image?t=${nonce}`} alt={visual.headline || `Picture ${visualIndex + 1}`} /> : <div><Icon name="image" size={23} /><span>{visual.error || 'Picture unavailable'}</span></div>}
                            <span>Picture {String(visualIndex + 1).padStart(2, '0')}</span>
                          </div>
                          <div className="asset-picture-copy">
                            <div><strong>{visual.headline || `Scene picture ${visualIndex + 1}`}</strong><small>Subtitles {startIndex + 1}–{endIndex + 1}</small></div>
                            <p>{editScenes.slice(startIndex, endIndex + 1).map(scene => scene.narration).join(' ')}</p>
                            <div className="asset-timing-fields">
                              <label>Starts at<select value={startIndex} disabled={working || sceneEditsChanged || visualIndex === 0} onChange={event => changePictureBoundary(visualIndex, 'start', Number(event.target.value))}>{editScenes.map((_, index) => index > (visualScenes[visualIndex - 1]?.lineStart ?? -1) && index <= endIndex ? <option key={index} value={index}>Subtitle {index + 1} · {formatEditorTime(subtitleTimeline[index]?.start ?? 0)}</option> : null)}</select></label>
                              <label>Ends after<select value={endIndex} disabled={working || sceneEditsChanged || visualIndex === visualScenes.length - 1} onChange={event => changePictureBoundary(visualIndex, 'end', Number(event.target.value))}>{editScenes.map((_, index) => index >= startIndex && index < (visualScenes[visualIndex + 1]?.lineEnd ?? editScenes.length) ? <option key={index} value={index}>Subtitle {index + 1} · {formatEditorTime(subtitleTimeline[index]?.end ?? 0)}</option> : null)}</select></label>
                            </div>
                            <label className="asset-search-field">Image search<input value={visual.searchQuery} onChange={event => setVisualScenes(items => items.map(item => item.id === visual.id ? { ...item, searchQuery: event.target.value } : item))} disabled={working} /></label>
                            <button type="button" className="asset-secondary-button" onClick={() => regenerateVisual(visual)} disabled={working || !visual.searchQuery.trim()}>{busy === `visual-${visual.id}` ? 'Replacing…' : 'Search & replace'}</button>
                          </div>
                        </article>;
                      })}
                    </div>
                  )}
                </section>

                <div className="asset-lower-grid">
                  {cfg.outputType === 'youtube' && <section className="asset-panel thumbnail-asset-panel">
                    <header><div><span className="asset-number">02</span><div><h2>Thumbnail</h2><p>Generated from your hook and topic visuals.</p></div></div></header>
                    {debate.thumbnailExists ? <img src={`/api/debate/${name}/thumbnail?t=${nonce}`} alt="Video thumbnail" /> : <div className="thumbnail-empty"><Icon name="image" size={24} /><span>Thumbnail preview</span></div>}
                    <div className="thumbnail-hook-copy"><small>Hook</small><strong>{editMetadataFields?.thumbnailHook || cfg.thumbnailHook || 'No thumbnail hook'}</strong></div>
                    <button type="button" className="asset-secondary-button" onClick={generateThumbnail} disabled={working}>{busy === 'thumbnail' ? 'Creating thumbnail…' : debate.thumbnailExists ? 'Regenerate thumbnail' : 'Generate thumbnail'}</button>
                    {thumbnailFeedback && <p className="thumbnail-feedback" role="status"><Icon name="check" size={14} /> {thumbnailFeedback}</p>}
                  </section>}

                  <section className="asset-panel audio-asset-panel">
                    <header><div><span className="asset-number">{cfg.outputType === 'youtube' ? '03' : '02'}</span><div><h2>Narration audio</h2><p>Choose voices, generate audio, then preview each subtitle.</p></div></div><button type="button" className="asset-secondary-button" onClick={generateAudio} disabled={working || renderElsewhere}><Icon name="sparkles" size={15} /> {audioReady ? 'Regenerate audio' : 'Generate audio'}</button></header>
                    {options && <div className="asset-voice-grid">{(cfg.contentMode === 'narrated-explainer' ? ['HOST'] as const : ['A', 'B'] as const).map(speaker => <label key={speaker}>{cfg.contentMode === 'narrated-explainer' ? 'Narrator voice' : `Speaker ${speaker}`}<span><select value={cfg.voices[speaker]} disabled={working} onChange={event => setVoice(speaker, event.target.value)}>{options.voices.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select><button type="button" onClick={() => previewVoice(cfg.voices[speaker])} disabled={working}>{previewing === cfg.voices[speaker] ? <span className="mini-spinner" /> : <Icon name="play" size={13} />}</button></span></label>)}</div>}
                    <div className="audio-subtitle-list">
                      {editScenes.map((scene, index) => {
                        const audioDuration = audioSegments.filter(segment => segment.sourceLineIndex === index).reduce((total, segment) => total + segment.durationSeconds, 0);
                        return <div key={scene.id}><span>{String(index + 1).padStart(2, '0')}</span><p><strong>{cfg.contentMode === 'debate' ? `${scene.speaker} · ` : ''}{scene.narration}</strong><small>{audioDuration ? `${audioDuration.toFixed(1)} sec` : 'Audio not generated'}</small></p><button type="button" onClick={() => playSubtitleAudio(index)} disabled={working || !audioDuration}>{playingSubtitleIndex === index ? '■' : <Icon name="play" size={13} />}</button></div>;
                      })}
                    </div>
                  </section>
                </div>

                <footer className="assets-footer">
                  <button type="button" className="copy-back-button" onClick={() => setWorkspaceSection('storyboard')} disabled={working}>Back</button>
                  <span>{assetsReady ? <><Icon name="check" size={13} /> Ready to render</> : 'Prepare all required assets before rendering.'}</span>
                  <div><button type="button" className="asset-secondary-button" onClick={() => openGeneratePlan('visuals')} disabled={working || renderElsewhere}><Icon name="sparkles" size={15} /> Generate all</button><button type="button" onClick={openRenderScreen} disabled={working || !assetsReady || sceneEditsChanged}>Next: Render <Icon name="arrow-right" size={15} /></button></div>
                </footer>
              </div>
            </div>
          </section>
          )}

          {/* Legacy combined editor kept unreachable while the focused visual workflow is finalized. */}
          {workspaceSection === 'visuals' && !editingVisuals && (
          <section className="unified-editor">
            <header className="unified-editor-toolbar">
              <div>
                <span className="eyebrow">Video editor</span>
                <strong>{editScenes.length} subtitles · {visualScenes.length || 0} pictures · {formatEditorTime(editorDuration)}</strong>
              </div>
              <div className="editor-toolbar-status">
                {sceneEditsChanged ? <span className="unsaved-indicator">Unsaved script</span> : <span className="saved-indicator"><Icon name="check" size={13} /> Saved</span>}
                <button type="button" className="btn-secondary" onClick={saveScenes} disabled={working || !sceneEditsChanged || hasInvalidScenes}>{busy === 'save-scenes' ? 'Saving…' : 'Save script'}</button>
                <button type="button" onClick={() => openGeneratePlan('script')} disabled={working || renderElsewhere || hasInvalidScenes}><Icon name="sparkles" size={15} /> Generate all</button>
              </div>
            </header>

            <div className="editor-main-grid">
              <aside className="editor-script-pane">
                <div className="editor-pane-heading"><strong>Script</strong><button type="button" onClick={addScriptSection} disabled={working}><Icon name="plus" size={13} /> Add scene</button></div>
                <div className="editor-script-columns"><span>#</span><span>Narration</span><span>Time</span><span>Audio</span></div>
                <div className="editor-script-list">
                  {editScenes.map((scene, index) => {
                    const firstInSection = index === 0 || editScenes[index - 1].sectionId !== scene.sectionId;
                    const visualIndex = visualScenes.findIndex(visual => index >= (visual.lineStart ?? 0) && index <= (visual.lineEnd ?? visual.lineStart ?? 0));
                    const timing = subtitleTimeline[index];
                    return <div key={scene.id}>
                      {firstInSection && (
                        <div className="editor-scene-heading">
                          <span>Scene {String(scriptSections.findIndex(section => section.id === (scene.sectionId ?? scene.id)) + 1).padStart(2, '0')}</span>
                          <input value={scene.headline} onChange={event => {
                            const sectionScenes = editScenes.filter(item => (item.sectionId ?? item.id) === (scene.sectionId ?? scene.id));
                            updateSectionTitle(sectionScenes.map(item => item.id), event.target.value);
                          }} disabled={working} placeholder="Optional scene title" />
                        </div>
                      )}
                      <div className={`editor-subtitle-row ${selectedSubtitle?.id === scene.id ? 'selected' : ''}`} onClick={() => {
                        setSelectedSubtitleId(scene.id);
                        if (visualIndex >= 0) setSelectedVisualId(visualScenes[visualIndex].id);
                      }}>
                        <span className="editor-subtitle-number">{String(index + 1).padStart(2, '0')}</span>
                        <textarea rows={2} value={scene.narration} onChange={event => updateScene(scene.id, { narration: event.target.value })} disabled={working} aria-label={`Subtitle ${index + 1}`} />
                        <span className="editor-subtitle-time">{formatEditorTime(timing?.start ?? 0)}<small>{formatEditorTime(timing?.end ?? 0)}</small></span>
                        <button type="button" className="editor-audio-button" onClick={event => { event.stopPropagation(); playSubtitleAudio(index); }} disabled={working || sceneEditsChanged || !audioSegments.some(segment => segment.sourceLineIndex === index)} title={sceneEditsChanged ? 'Save and regenerate audio after editing' : 'Play subtitle audio'}>
                          {playingSubtitleIndex === index ? '■' : <Icon name="play" size={13} />}
                        </button>
                        <i className={`editor-picture-dot picture-color-${Math.max(0, visualIndex) % 4}`} title={visualIndex >= 0 ? `Picture ${visualIndex + 1}` : 'No picture assigned'} />
                      </div>
                    </div>;
                  })}
                </div>
                <div className="editor-script-footer">
                  <button type="button" onClick={() => selectedSubtitle && addSubtitleAfter(selectedSubtitle.id, selectedSubtitle.sectionId ?? selectedSubtitle.id, selectedSubtitle.headline)} disabled={working || !selectedSubtitle}><Icon name="plus" size={13} /> Add subtitle</button>
                  <span>{totalWords} words</span>
                </div>
              </aside>

              <section className="editor-preview-pane">
                <div className="editor-preview-bar">
                  <span>16:9 · {debate.videoExists ? 'Rendered preview' : 'Storyboard preview'}</span>
                  <div className="editor-preview-options">
                    {cfg.visualMode === 'infographic' && <label><input type="checkbox" checked={cfg.sceneTitlesEnabled} onChange={event => { void updateSceneTitles(event.target.checked); }} disabled={working} /> Scene titles</label>}
                    <label><input type="checkbox" checked={cfg.subtitlesEnabled} onChange={event => setCfg(current => ({ ...current, subtitlesEnabled: event.target.checked }))} disabled={working} /> Subtitles</label>
                  </div>
                </div>
                <div className="editor-preview-stage">
                  {debate.videoExists ? (
                    <video key={nonce} controls preload="metadata" src={`/api/debate/${name}/video?t=${nonce}`} />
                  ) : selectedVisual?.imagePath ? (
                    <>
                      <img src={`/api/debate/${name}/visuals/${selectedVisual.id}/image?t=${nonce}`} alt={selectedVisual.headline || 'Selected picture'} />
                      {cfg.sceneTitlesEnabled && selectedVisual.headline && <strong className="editor-preview-title">{selectedVisual.headline}</strong>}
                      {cfg.subtitlesEnabled && selectedSubtitle && <p className="editor-preview-subtitle">{selectedSubtitle.narration}</p>}
                    </>
                  ) : (
                    <div className="editor-preview-empty"><Icon name="image" size={28} /><strong>No pictures yet</strong><p>Generate pictures to build the visual timeline.</p><button type="button" onClick={generateVisuals} disabled={!visualsConfigured || working || sceneEditsChanged}><Icon name="sparkles" size={15} /> Generate pictures</button></div>
                  )}
                </div>
                <div className="editor-preview-controls"><span>{formatEditorTime(subtitleTimeline[selectedSubtitleIndex]?.start ?? 0)} / {formatEditorTime(editorDuration)}</span><button type="button" onClick={() => playSubtitleAudio(selectedSubtitleIndex)} disabled={!audioSegments.some(segment => segment.sourceLineIndex === selectedSubtitleIndex)}>{playingSubtitleIndex === selectedSubtitleIndex ? '■' : <Icon name="play" size={17} />}</button><span>{debate.videoExists ? 'Use video controls to seek' : `Subtitle ${selectedSubtitleIndex + 1}`}</span></div>
                <div className="editor-asset-actions">
                  <button type="button" className="btn-secondary" onClick={generateVisuals} disabled={!visualsConfigured || working || sceneEditsChanged}><Icon name="sparkles" size={15} /> {visualScenes.length ? 'Regenerate pictures' : 'Generate pictures'}</button>
                  <button type="button" className="btn-secondary" onClick={generateAudio} disabled={working || sceneEditsChanged}><Icon name="sparkles" size={15} /> {debate.audioExists && audioSegments.length ? 'Regenerate audio' : 'Generate audio'}</button>
                  {sceneEditsChanged && <small>Save the script before regenerating assets.</small>}
                </div>
              </section>

              <aside className="editor-inspector">
                <div className="editor-pane-heading"><strong>Picture</strong><span>{selectedVisual ? `${activeVisualIndex + 1} of ${visualScenes.length}` : 'Not generated'}</span></div>
                {selectedVisual ? <>
                  <div className="editor-inspector-image">
                    {selectedVisual.imagePath ? <img src={`/api/debate/${name}/visuals/${selectedVisual.id}/image?t=${nonce}`} alt={selectedVisual.headline || 'Selected picture'} /> : <Icon name="image" size={24} />}
                  </div>
                  <label>Picture timing</label>
                  <div className="editor-range-fields">
                    <div><small>Starts at</small><select value={selectedVisual.lineStart ?? 0} disabled={working || sceneEditsChanged || activeVisualIndex === 0} onChange={event => changePictureBoundary(activeVisualIndex, 'start', Number(event.target.value))}>
                      {editScenes.map((_, index) => index > (visualScenes[activeVisualIndex - 1]?.lineStart ?? -1) && index <= (selectedVisual.lineEnd ?? 0) ? <option key={index} value={index}>{formatEditorTime(subtitleTimeline[index]?.start ?? 0)} · #{index + 1}</option> : null)}
                    </select></div>
                    <div><small>Ends after</small><select value={selectedVisual.lineEnd ?? 0} disabled={working || sceneEditsChanged || activeVisualIndex === visualScenes.length - 1} onChange={event => changePictureBoundary(activeVisualIndex, 'end', Number(event.target.value))}>
                      {editScenes.map((_, index) => index >= (selectedVisual.lineStart ?? 0) && index < (visualScenes[activeVisualIndex + 1]?.lineEnd ?? editScenes.length) ? <option key={index} value={index}>{formatEditorTime(subtitleTimeline[index]?.end ?? 0)} · #{index + 1}</option> : null)}
                    </select></div>
                  </div>
                  <small className="editor-range-summary">Covers subtitles {(selectedVisual.lineStart ?? 0) + 1}–{(selectedVisual.lineEnd ?? 0) + 1}. Adjacent timing stays linked.</small>
                  <label htmlFor="editor-picture-search">Replace picture</label>
                  <input id="editor-picture-search" value={selectedVisual.searchQuery} onChange={event => setVisualScenes(items => items.map(item => item.id === selectedVisual.id ? { ...item, searchQuery: event.target.value } : item))} disabled={working} />
                  <button type="button" className="btn-secondary editor-replace-picture" onClick={() => regenerateVisual(selectedVisual)} disabled={working || !selectedVisual.searchQuery.trim()}>{busy === `visual-${selectedVisual.id}` ? 'Replacing…' : 'Search & replace'}</button>
                  <label>Motion</label>
                  <select disabled value="automatic"><option value="automatic">Left slide + smooth zoom out</option></select>
                </> : <div className="editor-inspector-empty"><p>Generate pictures to edit their timing, search and display settings.</p></div>}
              </aside>
            </div>

            <section className="editor-visual-timeline">
              <div className="editor-timeline-heading"><strong>Visual timeline</strong><span>{visualScenes.length} pictures · {editScenes.length} subtitles</span></div>
              <div className="editor-timeline-track">
                {visualScenes.length ? visualScenes.map((visual, index) => {
                  const start = subtitleTimeline[visual.lineStart ?? 0]?.start ?? 0;
                  const end = subtitleTimeline[visual.lineEnd ?? visual.lineStart ?? 0]?.end ?? start;
                  return <button type="button" key={visual.id} className={`editor-timeline-clip picture-color-${index % 4} ${selectedVisual?.id === visual.id ? 'selected' : ''}`} style={{ flexGrow: Math.max(1, end - start) }} onClick={() => setSelectedVisualId(visual.id)}>
                    <span>{visual.imagePath && <img src={`/api/debate/${name}/visuals/${visual.id}/image?t=${nonce}`} alt="" />}</span>
                    <strong>Picture {index + 1}</strong><small>{formatEditorTime(start)}–{formatEditorTime(end)} · Subtitles {(visual.lineStart ?? 0) + 1}–{(visual.lineEnd ?? 0) + 1}</small>
                  </button>;
                }) : <div className="editor-timeline-empty">Pictures will appear here after generation.</div>}
              </div>
            </section>

            <footer className="unified-editor-footer">
              <div>{hasInvalidScenes ? <span className="save-warning">Every subtitle needs narration.</span> : sceneEditsChanged ? <span className="unsaved-indicator">Save changes to update audio and timing.</span> : <span className="saved-indicator"><Icon name="check" size={13} /> All changes saved</span>}</div>
              <div><button type="button" className="btn-secondary" onClick={() => { setReviewTab('metadata'); setWorkspaceSection('storyboard'); }} disabled={working}>Script &amp; metadata</button><button type="button" onClick={generateVideo} disabled={working || renderElsewhere || !audioReady || !visualsReady || sceneEditsChanged}>Render video</button></div>
            </footer>
          </section>
          )}

          {/* 4 — Render */}
          {workspaceSection === 'video' && (
          <section className="render-screen">
            <header className="copy-review-header render-header">
              <button type="button" className="copy-review-brand" onClick={showProjects} disabled={working}>
                <BrandMark /><strong>KZR CREATOR STUDIO</strong>
              </button>
              <div className="copy-review-project"><span>{debate.debateName}</span><strong>{debate.topic}</strong></div>
              <div className="copy-review-header-actions">
                <span className={completePackReady ? 'saved-indicator' : 'unsaved-indicator'}>{completePackReady ? <><Icon name="check" size={13} /> Videos ready</> : 'Ready to render'}</span>
                <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
              </div>
            </header>

            <div className="copy-review-layout render-layout">
              <aside className="copy-step-sidebar" aria-label="Project steps">
                <ol>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={returnToVideoSetup}><strong>Video setup</strong><small>Brief and direction</small></button></li>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={() => setWorkspaceSection('storyboard')}><strong>Script &amp; metadata</strong><small>Copy reviewed</small></button></li>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={() => setWorkspaceSection('visuals')}><strong>Visuals &amp; audio</strong><small>Assets prepared</small></button></li>
                  <li className="active"><span>4</span><button type="button"><strong>Render</strong><small>Create the videos</small></button></li>
                  <li><span>5</span><button type="button" onClick={() => setWorkspaceSection('publish')} disabled={!completePackReady}><strong>Publish</strong><small>Download or share</small></button></li>
                </ol>
              </aside>

              <div className="render-main">
                <header className="render-titlebar">
                  <div><span className="eyebrow">Step 4</span><h1>Render &amp; preview</h1><p>Combine your approved script, visuals and audio into the final videos.</p></div>
                  <span className="local-render-badge"><Icon name="check" size={13} /> Local render · no API cost</span>
                </header>

                <div className="render-readiness-strip">
                  <div className={visualsReady ? 'ready' : ''}><span><Icon name="image" size={17} /></span><p><strong>Visuals</strong><small>{visualsReady ? 'Ready' : 'Missing'}</small></p>{visualsReady && <Icon name="check" size={14} />}</div>
                  <div className={audioReady ? 'ready' : ''}><span><Icon name="play" size={17} /></span><p><strong>Audio</strong><small>{audioReady ? `${audioSegments.length} clips` : 'Missing'}</small></p>{audioReady && <Icon name="check" size={14} />}</div>
                  <div className={thumbnailReady ? 'ready' : ''}><span><Icon name="monitor" size={17} /></span><p><strong>Thumbnail</strong><small>{thumbnailReady ? 'Ready' : 'Missing'}</small></p>{thumbnailReady && <Icon name="check" size={14} />}</div>
                </div>

                <div className="render-work-grid">
                  <section className="render-preview-panel">
                    <header><div><h2>Video preview</h2><p>{cfg.outputType === 'youtube' ? '16:9 landscape' : '9:16 vertical'} · {cfg.videoLengthMinutes} min target</p></div>{debate.videoExists && <span><Icon name="check" size={13} /> Rendered</span>}</header>
                    <div className={`render-player ${cfg.outputType === 'short' ? 'portrait' : ''}`}>
                      {debate.videoExists ? <video controls src={`/api/debate/${name}/video?t=${nonce}`} /> : <div className="render-player-empty"><span><Icon name="play" size={28} /></span><strong>Your preview will appear here</strong><p>Everything is prepared. Start the render when you are ready.</p></div>}
                    </div>
                    <div className="render-preview-actions">
                      <button type="button" onClick={generateVideo} disabled={working || renderElsewhere || !assetsReady}><Icon name="play" size={15} /> {job?.kind === 'video' ? 'Rendering…' : debate.videoExists ? 'Render video again' : 'Render video'}</button>
                      {cfg.outputType === 'youtube' && cfg.extractReels && <button type="button" className="extract-shorts-button" onClick={extractAndRenderShorts} disabled={working || renderElsewhere || !debate.videoExists}><Icon name="sparkles" size={15} /> {job?.kind === 'reels' ? 'Extracting…' : reelsReady ? 'Extract shorts again' : 'Extract shorts'}</button>}
                      {debate.videoExists && <a className="render-download" href={`/api/debate/${name}/video`} download>Download video</a>}
                    </div>
                  </section>

                  <aside className="render-settings-panel">
                    <header><div><h2>Render settings</h2><p>Only display and export controls live here.</p></div></header>
                    <div className="render-output-summary">
                      <span>{cfg.outputType === 'youtube' ? <Icon name="monitor" size={21} /> : <Icon name="smartphone" size={21} />}</span>
                      <p><strong>{cfg.outputType === 'youtube' ? 'YouTube video' : 'Short / Reel'}</strong><small>{cfg.outputType === 'youtube' ? '1920 × 1080' : '1080 × 1920'} · MP4</small></p>
                    </div>
                    {cfg.outputType === 'youtube' && cfg.extractReels && <div className="render-output-summary secondary"><span><Icon name="smartphone" size={21} /></span><p><strong>Reels / Shorts</strong><small>Automatically extracted · 50–53 sec</small></p></div>}

                    <div className="render-setting-group">
                      <span>On-screen content</span>
                      <label className="render-switch"><div><strong>Show subtitles</strong><small>Display narration on screen</small></div><input type="checkbox" checked={cfg.subtitlesEnabled} disabled={working} onChange={event => setCfg(current => ({ ...current, subtitlesEnabled: event.target.checked }))} /><i /></label>
                      {cfg.visualMode === 'infographic' && <div className="scene-title-mode-control">
                        <div><strong>Scene titles</strong><small>Choose how each section heading appears</small></div>
                        <div className="scene-title-mode-options">
                          {([
                            ['intro', 'Animated · 3 sec', 'Slides in, then fades away'],
                            ['persistent', 'Persistent', 'Stays until the next scene'],
                            ['hidden', 'Hidden', 'No scene headings'],
                          ] as const).map(([mode, label, description]) => <button
                            type="button"
                            key={mode}
                            className={cfg.sceneTitleMode === mode ? 'selected' : ''}
                            aria-pressed={cfg.sceneTitleMode === mode}
                            disabled={working}
                            onClick={() => setCfg(current => ({ ...current, sceneTitleMode: mode, sceneTitlesEnabled: mode !== 'hidden' }))}
                          ><strong>{label}</strong><small>{description}</small></button>)}
                        </div>
                      </div>}
                    </div>

                    {options && <div className="render-setting-group">
                      <button type="button" className="render-advanced-toggle" onClick={() => setShowAdvanced(value => !value)} disabled={working}><span><strong>Advanced styling</strong><small>Video and subtitle appearance</small></span><b>{showAdvanced ? '−' : '+'}</b></button>
                      {showAdvanced && <div className="render-advanced-fields">
                        <label>Video style<select value={cfg.videoStyle} disabled={working} onChange={event => setCfg(current => ({ ...current, videoStyle: event.target.value }))}>{options.videoStyles.map(style => <option key={style} value={style}>{style}</option>)}</select></label>
                        <label>Subtitle style<select value={cfg.subtitleStyle} disabled={working || !cfg.subtitlesEnabled} onChange={event => setCfg(current => ({ ...current, subtitleStyle: event.target.value }))}>{options.subtitleStyles.map(style => <option key={style} value={style}>{style}</option>)}</select></label>
                        <label className="render-custom-check"><input type="checkbox" checked={useCustom} disabled={working || !cfg.subtitlesEnabled} onChange={event => setUseCustom(event.target.checked)} /> Custom subtitle controls</label>
                        {useCustom && <div className="render-custom-grid">
                          <label>Position<select value={cs.position} disabled={working} onChange={event => setCustom('position', event.target.value)}>{options.positions.map(position => <option key={position} value={position}>{position}</option>)}</select></label>
                          <label>Font size<input type="number" min={10} max={200} value={cs.fontsize} disabled={working} onChange={event => setCustom('fontsize', Number(event.target.value))} /></label>
                          <label>Text color<input value={cs.fontcolor} disabled={working} onChange={event => setCustom('fontcolor', event.target.value)} /></label>
                          <label>Margin<input type="number" min={0} max={1000} value={cs.margin} disabled={working} onChange={event => setCustom('margin', Number(event.target.value))} /></label>
                        </div>}
                      </div>}
                    </div>}
                  </aside>
                </div>

                {cfg.outputType === 'youtube' && cfg.extractReels && (
                  <section className="render-reels-panel">
                    <header><div><h2>Reels &amp; Shorts</h2><p>{debate.reelsCount ? `${debate.reelsCount} vertical clips rendered from the main video.` : 'Vertical clips will appear after the main render finishes.'}</p></div><span className={reelsReady ? 'ready' : ''}>{reelsReady ? <><Icon name="check" size={13} /> Ready</> : `${plannedReels || 3} planned`}</span></header>
                    {debate.reelsCount > 0 ? <div className="render-reel-grid">{Array.from({ length: debate.reelsCount }).map((_, index) => <article key={index}><video controls preload="metadata" src={`/api/debate/${name}/video?reel=${index}&t=${nonce}`} /><div><strong>Reel {index + 1}</strong><a href={`/api/debate/${name}/video?reel=${index}`} download>Download</a></div></article>)}</div> : <div className="render-reels-empty"><Icon name="smartphone" size={24} /><span>Waiting for render</span></div>}
                  </section>
                )}

                <footer className="render-footer">
                  <button type="button" className="copy-back-button" onClick={() => setWorkspaceSection('visuals')} disabled={working}>Back</button>
                  <span>{assetsReady ? <><Icon name="check" size={13} /> All assets prepared</> : 'Return to Visuals & audio to prepare missing assets.'}</span>
                  <div><button type="button" onClick={() => setWorkspaceSection('publish')} disabled={working || !completePackReady}>Next: Publish <Icon name="arrow-right" size={15} /></button></div>
                </footer>
              </div>
            </div>
          </section>
          )}

          {/* 5 — Publish */}
          {workspaceSection === 'publish' && (
          <section className="publish-screen">
            <header className="copy-review-header publish-header">
              <button type="button" className="copy-review-brand" onClick={showProjects} disabled={working}>
                <BrandMark /><strong>KZR CREATOR STUDIO</strong>
              </button>
              <div className="copy-review-project"><span>{debate.debateName}</span><strong>{debate.topic}</strong></div>
              <div className="copy-review-header-actions">
                <span className="saved-indicator"><Icon name="check" size={13} /> Ready to publish</span>
                <ThemeToggle theme={theme} onToggle={() => selectTheme(theme === 'light' ? 'dark' : 'light')} />
              </div>
            </header>

            <div className="copy-review-layout publish-layout">
              <aside className="copy-step-sidebar" aria-label="Project steps">
                <ol>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={returnToVideoSetup}><strong>Video setup</strong><small>Brief and direction</small></button></li>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={() => setWorkspaceSection('storyboard')}><strong>Script &amp; metadata</strong><small>Copy reviewed</small></button></li>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={() => setWorkspaceSection('visuals')}><strong>Visuals &amp; audio</strong><small>Assets prepared</small></button></li>
                  <li className="complete"><span><Icon name="check" size={14} /></span><button type="button" onClick={() => setWorkspaceSection('video')}><strong>Render</strong><small>Videos created</small></button></li>
                  <li className="active"><span>5</span><button type="button"><strong>Publish</strong><small>Download or share</small></button></li>
                </ol>
              </aside>

              <div className="publish-main">
                <header className="publish-titlebar">
                  <div><span className="eyebrow">Step 5</span><h1>Publish &amp; download</h1><p>Your files are ready. Download them or send them directly to your connected channels.</p></div>
                  <button type="button" className="publish-check-button" onClick={() => call('check-publishing', async () => { await refreshPublishingReadiness('all'); })} disabled={working || checkingPublishing}>{checkingPublishing ? <><span className="mini-spinner" /> Checking…</> : 'Check connections'}</button>
                </header>

                <section className="publish-ready-banner">
                  <span><Icon name="check" size={22} /></span>
                  <div><small>Production complete</small><strong>Your video pack is ready</strong><p>{cfg.outputType === 'short' ? 'One vertical video is available.' : `One YouTube video${cfg.extractReels ? ` and ${plannedReels} vertical shorts are available.` : ' is available.'}`}</p></div>
                  <a href={`/api/debate/${name}/download`} download>Download full pack</a>
                </section>

                <div className="publish-content-grid">
                  <section className="publish-files-panel">
                    <header><div><h2>Finished files</h2><p>Preview or download individual videos.</p></div><span>{1 + debate.reelsCount} file{1 + debate.reelsCount === 1 ? '' : 's'}</span></header>
                    <article className="publish-main-file">
                      <div className="publish-file-preview">{debate.thumbnailExists ? <img src={`/api/debate/${name}/thumbnail?t=${nonce}`} alt="Video thumbnail" /> : <video preload="metadata" src={`/api/debate/${name}/video?t=${nonce}`} />}</div>
                      <div><span><Icon name={cfg.outputType === 'youtube' ? 'monitor' : 'smartphone'} size={18} /></span><p><strong>{editMetadataFields?.youtube.title || debate.topic}</strong><small>{cfg.outputType === 'youtube' ? 'YouTube video · 16:9' : 'Vertical video · 9:16'}</small></p><a href={`/api/debate/${name}/video`} download>Download</a></div>
                    </article>
                    {debate.reelsCount > 0 && <div className="publish-short-files">{Array.from({ length: debate.reelsCount }).map((_, index) => <article key={index}><video controls playsInline preload="metadata" src={`/api/debate/${name}/video?reel=${index}&t=${nonce}`} /><div><p><strong>Short {index + 1}</strong><small>9:16 · 52 sec</small></p><a href={`/api/debate/${name}/video?reel=${index}`} download>Download</a></div></article>)}</div>}
                  </section>

                  <section className="publish-platforms-panel">
                    <header><div><h2>Connected channels</h2><p>Access is checked before every upload.</p></div></header>
                    {(['youtube', 'instagram'] as const).map(platform => {
                      const status = publishingReadiness?.platforms[platform];
                      const isYouTube = platform === 'youtube';
                      const published = isYouTube ? youtubePublished : instagramPublished;
                      const unavailable = isYouTube
                        ? !debate.videoExists || (cfg.extractReels && !reelsReady)
                        : !reelsReady;
                      return <article className={`publish-platform-card ${status?.valid === true ? 'connected' : status?.valid === false ? 'attention' : ''}`} key={platform}>
                        <div className="publish-platform-heading">
                          <span className={isYouTube ? 'youtube-mark' : 'instagram-mark'}>{isYouTube ? <Icon name="play" size={17} /> : <Icon name="image" size={17} />}</span>
                          <p><strong>{isYouTube ? 'YouTube' : 'Instagram'}</strong><small>{isYouTube ? `Main video${cfg.extractReels ? ' + Shorts' : ''}` : `${plannedReels || 0} Reels`}</small></p>
                          <b>{status?.valid === true ? <><Icon name="check" size={12} /> Connected</> : status?.valid === false ? 'Reconnect' : checkingPublishing ? 'Checking…' : 'Unknown'}</b>
                        </div>
                        <div className="publish-token-info">
                          <p>{status?.message ?? 'Checking connection status…'}</p>
                          {status?.tokenExpiresAt ? <strong>Token expires {formatCredentialDate(status.tokenExpiresAt)}</strong> : status?.valid === true ? <strong>No fixed token expiry</strong> : null}
                          {status?.dataAccessExpiresAt && <small>Data access expires {formatCredentialDate(status.dataAccessExpiresAt)}</small>}
                        </div>
                        {published ? <div className="publish-complete-state"><Icon name="check" size={15} /><span>Published successfully</span></div> : <button type="button" onClick={isYouTube ? publishYouTube : publishInstagram} disabled={working || renderElsewhere || unavailable || status?.valid !== true}>{job?.kind === `publish-${platform}` ? `Publishing to ${isYouTube ? 'YouTube' : 'Instagram'}…` : `Publish to ${isYouTube ? 'YouTube' : 'Instagram'}`}</button>}
                        {published && <div className="published-link-list">
                          {isYouTube && debate.publishing?.youtube?.main && <a href={debate.publishing.youtube.main.url} target="_blank" rel="noreferrer">Open main video</a>}
                          {isYouTube && debate.publishing?.youtube?.shorts?.map(item => <a key={item.part} href={item.url} target="_blank" rel="noreferrer">Open Short {item.part}</a>)}
                          {!isYouTube && debate.publishing?.instagram?.map(item => item.url ? <a key={item.part} href={item.url} target="_blank" rel="noreferrer">Open Reel {item.part}</a> : <span key={item.part}>Reel {item.part} published</span>)}
                        </div>}
                      </article>;
                    })}
                  </section>
                </div>

                {(job?.kind === 'publish-youtube' || job?.kind === 'publish-instagram') && <div className="publish-inline-progress"><span className="job-spinner" /><div><strong>{job.kind === 'publish-youtube' ? 'Uploading to YouTube…' : 'Uploading reels to Instagram…'}</strong><p>{job.logs?.at(-1) || 'Keep this page open until publishing finishes.'}</p></div></div>}
                {debate.publishing?.status === 'error' && debate.publishing.error && <div className="publish-error-card"><strong>Publishing failed</strong><p>{debate.publishing.error}</p></div>}

                {authErrorPlatform === 'youtube' && <section className="publish-recovery studio-recovery"><strong>Reconnect YouTube</strong><ol><li>Open <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer">Google OAuth Playground</a>.</li><li>Enable “Use your own OAuth credentials” and enter your existing client credentials.</li><li>Authorize <code>https://www.googleapis.com/auth/youtube.upload</code> using the correct channel.</li><li>Exchange the code, replace <code>YOUTUBE_REFRESH_TOKEN</code>, then restart the app.</li></ol></section>}
                {authErrorPlatform === 'instagram' && <section className="publish-recovery studio-recovery"><strong>Reconnect Instagram</strong><ol><li>Open <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Meta Graph API Explorer</a> and generate a token with your existing publishing permissions.</li><li>Extend it using the <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer">Access Token Debugger</a>.</li><li>Request <code>/me/accounts?fields=id,name,access_token,instagram_business_account</code>.</li><li>Replace the Instagram token and account ID, then restart the app.</li></ol></section>}

                <footer className="publish-footer">
                  <button type="button" className="copy-back-button" onClick={() => setWorkspaceSection('video')} disabled={working}>Back</button>
                  <span>{youtubePublished || instagramPublished ? <><Icon name="check" size={13} /> Publishing activity saved</> : 'Nothing is uploaded until you choose a platform.'}</span>
                  <div><a href={`/api/debate/${name}/download`} download>Download pack</a><button type="button" onClick={showProjects} disabled={working}>Done</button></div>
                </footer>
              </div>
            </div>
          </section>
          )}
        </>
      )}
      </div>
    </main>
  );
}
