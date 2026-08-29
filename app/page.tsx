'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';

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
  voices: { HOST: string; A: string; B: string };
  ttsModel: string;
  ttsSpeed: number;
  subtitlesEnabled: boolean;
  sceneTitlesEnabled: boolean;
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
  operation: string;
  model: string;
}

interface UsageSummary {
  total: UsageNumbers & { calls: number };
  lastCall: UsageCall | null;
  usdToInr: number;
  exchangeRateAsOf: string;
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
type WorkspaceSection = 'overview' | 'storyboard' | 'metadata' | 'video' | 'shorts' | 'publish';
type HomeView = 'projects' | 'create';
type ProjectFilter = 'all' | 'draft' | 'generating' | 'ready';
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
const DEFAULT_CFG: RunConfig = {
  contentMode: 'narrated-explainer',
  visualMode: 'infographic',
  visualPacing: 'balanced',
  outputType: 'youtube',
  videoLengthMinutes: 3,
  extractReels: true,
  voices: { HOST: 'alloy', A: 'echo', B: 'ash' },
  ttsModel: 'tts-1',
  ttsSpeed: 1.0,
  subtitlesEnabled: true,
  sceneTitlesEnabled: true,
  subtitleStyle: 'top-classic',
  videoStyle: 'style1',
};
const DEFAULT_CUSTOM: CustomSubtitle = {
  position: 'top', font: '', fontsize: 44, fontcolor: 'white',
  bordercolor: 'black', borderw: 3, margin: 120,
};

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

export default function Home() {
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [debate, setDebate] = useState<Debate | null>(null);

  const [editScenes, setEditScenes] = useState<ScriptScene[]>([]);
  const [editMetadataFields, setEditMetadataFields] = useState<ProjectMetadata | null>(null);
  const [editReels, setEditReels] = useState<ReelScript[]>([]);

  const [job, setJob] = useState<JobView | null>(null);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
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
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('overview');
  const [homeView, setHomeView] = useState<HomeView>('projects');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number | null>(null);
  const [publishingReadiness, setPublishingReadiness] = useState<PublishingReadiness | null>(null);
  const [checkingPublishing, setCheckingPublishing] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/options').then(r => r.json()).then(setOptions).catch(() => {});
    refreshProjects();
    refreshUsage();
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

  async function refreshUsage() {
    try {
      const data = await jsonOrThrow(await fetch('/api/usage', { cache: 'no-store' }));
      setUsage(data as UsageSummary);
    } catch { /* Usage display must never block the video workflow. */ }
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
    setSelectedSubtitleId(norm.scenes[0]?.id ?? null);
    setEditMetadataFields(norm.metadataFields);
    setEditReels(norm.reelScripts);
    setCfg({
      ...DEFAULT_CFG,
      ...(norm.config ?? {}),
      voices: { ...DEFAULT_CFG.voices, ...(norm.config?.voices ?? {}) },
      customSubtitle: norm.config?.customSubtitle ?? DEFAULT_CUSTOM,
    });
    setUseCustom(!!norm.config?.customSubtitle);
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
    try { await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.'); }
    finally { setBusy(''); await refreshUsage(); }
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
    return useCustom ? { ...rest, customSubtitle: cleanCustom(customSubtitle ?? DEFAULT_CUSTOM) } : rest;
  }

  // ---- raw steps (composable; used by manual buttons and the auto chain) ----
  // Each takes an optional debate name so the non-stop chain can thread it through
  // synchronously (React state hasn't settled mid-chain). Manual/gated callers omit it
  // and fall back to the current debate.
  const rawScript = async (configOverride?: RunConfig): Promise<string> => {
    if (!topic.trim()) throw new Error('Please enter a topic.');
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
    setAudioSegments([]);
  };
  const rawMetadata = async (name = debate!.debateName) => {
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/metadata`, { method: 'POST' }));
    setEditMetadataFields(data.metadataFields);
    setDebate(d => (d ? { ...d, metadata: data.metadata, metadataFields: data.metadataFields } : d));
  };
  const rawSaveMetadata = async (name = debate!.debateName) => {
    if (!editMetadataFields) throw new Error('Generate metadata first.');
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/metadata`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadataFields: editMetadataFields }),
    }));
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
    const selectedConfig = { ...buildConfigPayload(), sceneTitlesEnabled: enabled };
    setCfg(current => ({ ...current, sceneTitlesEnabled: enabled }));
    if (!debate) return;
    try {
      await saveConfig(debate.debateName, selectedConfig);
      setDebate(current => current ? {
        ...current,
        config: { ...(current.config ?? {}), sceneTitlesEnabled: enabled },
        videoExists: false,
        publishing: null,
      } : current);
    } catch (err) {
      setCfg(current => ({ ...current, sceneTitlesEnabled: previous }));
      setError(err instanceof Error ? err.message : 'Could not save the scene-title setting.');
    }
  };
  const rawThumbnail = async (name = debate!.debateName) => {
    await jsonOrThrow(await fetch(`/api/debate/${name}/thumbnail`, { method: 'POST' }));
    setDebate(d => (d ? { ...d, thumbnailExists: true } : d));
    setNonce(n => n + 1);
  };
  const rawVisuals = async (name = debate!.debateName, selectedConfig = buildConfigPayload()) => {
    await saveConfig(name, selectedConfig);
    try { await startJobAndWait(`/api/debate/${name}/visuals`, 'visuals', name); }
    finally { await refreshVisuals(name); }
  };
  const rawAudio = async (name = debate!.debateName, selectedConfig = buildConfigPayload()) => {
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
  const saveMetadata = () => call('save-metadata', rawSaveMetadata);
  const generateThumbnail = () => call('thumbnail', rawThumbnail);
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
    await rawScript();
    setAuto(false);
    setAutoStep(null);
  });

  // Run every remaining creation stage without review pauses.
  const generateAllVideos = () => call('auto', async () => {
    setAuto(true); setAutoStep('running');
    try {
      const fullPackConfig: RunConfig = {
        ...buildConfigPayload(),
        extractReels: cfg.outputType === 'youtube',
      };
      setCfg(fullPackConfig);
      const name = await rawScript(fullPackConfig);
      await rawMetadata(name);
      if (fullPackConfig.visualMode === 'infographic') await rawVisuals(name, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube') await rawThumbnail(name);
      await rawAudio(name, fullPackConfig);
      await rawVideoRender(name, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube') {
        await rawExtract(name);
        await rawReels(name);
      }
      await refetchDebate(name);
      setWorkspaceSection('overview');
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

  async function continueAfterMetadata() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try {
      if (JSON.stringify(editMetadataFields) !== JSON.stringify(debate!.metadataFields)) await rawSaveMetadata();
      if (cfg.outputType === 'youtube') await rawThumbnail();
      setAuto(false); setAutoStep(null);
      setWorkspaceSection('publish');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto run failed.');
      setAutoStep(null);
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
    try { await rawReels(); setAuto(false); setAutoStep(null); setWorkspaceSection('metadata'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Reel build failed.'); setAutoStep('awaiting-reels'); }
    finally { setBusy(''); }
  }

  function startNew() {
    localStorage.removeItem(LS_KEY);
    let saved: { topic?: string; context?: string; config?: Partial<RunConfig> } = {};
    try { saved = JSON.parse(localStorage.getItem(CREATION_DRAFT_KEY) ?? '{}'); }
    catch { /* ignore an invalid local draft */ }
    setDebate(null); setTopic(saved.topic ?? ''); setContext(saved.context ?? '');
    setCfg({ ...DEFAULT_CFG, ...(saved.config ?? {}), voices: { ...DEFAULT_CFG.voices, ...(saved.config?.voices ?? {}) } });
    setEditScenes([]); setEditMetadataFields(null); setEditReels([]);
    setVisualScenes([]);
    setJob(null); setError(''); setAuto(false); setAutoStep(null);
    setCreationDraftSaved(!!saved.topic);
    setShowAdvanced(false);
    setWorkspaceSection('overview');
    setHomeView('create');
  }

  function showProjects() {
    localStorage.removeItem(LS_KEY);
    setDebate(null); setJob(null); setError(''); setAuto(false); setAutoStep(null);
    setHomeView('projects');
  }

  async function openProject(projectName: string) {
    if (working || projectName === name) return;
    await call('open-project', async () => {
      const data = await jsonOrThrow(await fetch(`/api/debate/${projectName}`));
      loadDebate(data);
      setWorkspaceSection('overview');
      setHomeView('projects');
    });
  }

  const setVoice = (sp: 'HOST' | 'A' | 'B', v: string) =>
    setCfg(c => ({ ...c, voices: { ...c.voices, [sp]: v } }));

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

  function updateReelCaption(part: number, caption: string) {
    setEditMetadataFields(current => current ? {
      ...current,
      reels: current.reels.map(reel => reel.part === part ? { ...reel, caption } : reel),
    } : current);
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
      extractReels: cfg.outputType === 'youtube',
    };
    setCfg(fullPackConfig);
    setAuto(true);
    setAutoStep('running');
    try {
      if (sceneEditsChanged) await rawSaveScenes(projectName);
      await rawMetadata(projectName);
      if (fullPackConfig.visualMode === 'infographic') await rawVisuals(projectName, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube') await rawThumbnail(projectName);
      await rawAudio(projectName, fullPackConfig);
      await rawVideoRender(projectName, fullPackConfig);
      if (fullPackConfig.outputType === 'youtube') {
        await rawExtract(projectName);
        await rawReels(projectName);
      }
      await refetchDebate(projectName);
      setWorkspaceSection('overview');
    } finally {
      setAuto(false);
      setAutoStep(null);
    }
  });

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
    && (cfg.outputType === 'short' || reelsReady);
  // A render running on some OTHER debate (our own render is already shown via `job`).
  const renderElsewhere = !!globalBusy && globalBusy.debateName !== name;
  const visualsReady = cfg.visualMode !== 'infographic'
    || (visualScenes.length > 0 && visualScenes.every(scene => scene.imagePath));
  const scriptSections: Array<{ id: string; headline: string; scenes: ScriptScene[] }> = [];
  for (const scene of editScenes) {
    const previous = scriptSections.at(-1);
    const sectionId = scene.sectionId ?? scene.id;
    if (previous && previous.id === sectionId) previous.scenes.push(scene);
    else scriptSections.push({ id: sectionId, headline: scene.headline, scenes: [scene] });
  }
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

  const creating = !debate && homeView === 'create';
  const editingProject = !!debate;
  const editingScript = !!debate && workspaceSection === 'storyboard';
  const projectsHome = !debate && homeView === 'projects';

  return (
    <main className={`app-shell theme-${theme} ${projectsHome ? 'projects-mode' : ''} ${creating ? 'creation-mode' : ''} ${editingProject ? 'project-mode' : ''} ${editingScript ? 'script-mode' : ''}`}>
      <aside className="usage-hud" aria-label="OpenAI usage and estimated cost">
        <div>
          <span>Total</span>
          <strong>{formatTokens(usage?.total.totalTokens ?? 0)} tokens</strong>
          <small>{formatUsageMoney(usage?.total.costUsd ?? 0, 'USD')} · {formatUsageMoney(usage?.total.costInr ?? 0, 'INR')}</small>
        </div>
        <div title={usage?.lastCall ? `${usage.lastCall.operation} · ${usage.lastCall.model}` : 'No OpenAI calls tracked yet'}>
          <span>Last call</span>
          <strong>{formatTokens(usage?.lastCall?.totalTokens ?? 0)} tokens</strong>
          <small>{usage?.lastCall?.characters ? `${formatTokens(usage.lastCall.characters)} chars · ` : ''}{formatUsageMoney(usage?.lastCall?.costUsd ?? 0, 'USD')} · {formatUsageMoney(usage?.lastCall?.costInr ?? 0, 'INR')}</small>
        </div>
      </aside>
      {!creating && !editingProject && <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="play" size={15} /></span>
          <span><b>KZR</b><small>Creator Studio</small></span>
        </div>
        <span className="sidebar-label">Workspace</span>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={!debate && homeView === 'projects' ? 'nav-item active' : 'nav-item'} onClick={showProjects} disabled={working}>
            <Icon name="folder" size={17} /> Projects
          </button>
          <button className="nav-item" onClick={startNew} disabled={working}>
            <Icon name="plus" size={17} /> New video
          </button>
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" /> Local workspace
          <small>Private on this computer</small>
        </div>
      </aside>}
      <div className={`workspace ${creating ? 'creation-workspace' : ''} ${editingProject ? 'project-workspace' : ''} ${editingScript ? 'script-workspace' : ''}`}>
      {debate && (
      <header className="topbar">
        <div>
          <span className="eyebrow">Project workspace</span>
          <h1>{debate.topic || debate.debateName}</h1>
          <p className="sub">{debate.debateName} · Edit, render and download your video pack.</p>
        </div>
        <div className="topbar-actions">
          <button className="topbar-projects" type="button" onClick={showProjects} disabled={working}>
            <Icon name="folder" size={16} /> Projects
          </button>
          <button
            className="icon-button"
            onClick={() => selectTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
          </button>
        </div>
      </header>
      )}

      {creating && (
        <header className="creation-app-header">
          <button type="button" className="creation-brand" onClick={showProjects} disabled={working}>
            <span className="brand-mark"><Icon name="play" size={16} /></span>
            <strong>KZR CREATOR STUDIO</strong>
          </button>
          <nav className="creation-progress" aria-label="Creation progress">
            <span className="active"><Icon name="folder" size={16} /> Brief</span>
            <i />
            <span><Icon name="image" size={16} /> Look</span>
            <i />
            <span><Icon name="list" size={16} /> Review</span>
          </nav>
          <div className="creation-header-actions">
            <button className="icon-button" type="button" onClick={() => selectTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
              <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
            </button>
            <button className="save-draft-button" type="button" onClick={saveCreationDraft} disabled={working}>
              <Icon name="save" size={16} /> {creationDraftSaved ? 'Draft saved' : 'Save draft'}
            </button>
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

      {creating && (
        <section className="creation-page">
          <div className="creation-title">
            <h1>Create a new video</h1>
            <p>Set the direction now. Fine-tune every scene later.</p>
          </div>
          <div className="creation-studio">
            <section className="creation-brief-column">
              <div className="creation-section-title"><span><Icon name="folder" size={17} /></span><h2>Project brief</h2></div>
              <div className="creation-field">
                <label htmlFor="topic">Title</label>
                <div className="counted-field">
                  <input id="topic" maxLength={120} value={topic} onChange={e => { setTopic(e.target.value); setCreationDraftSaved(false); }} placeholder="e.g. How Ancient Rome shaped the modern world" disabled={working} />
                  <small>{topic.length}/120</small>
                </div>
              </div>
              <div className="creation-field">
                <label htmlFor="context">Context</label>
                <div className="counted-field textarea-field">
                  <textarea id="context" maxLength={1000} value={context} onChange={e => { setContext(e.target.value); setCreationDraftSaved(false); }} placeholder="Add key facts, your point of view, target audience, or anything the script should include…" disabled={working} />
                  <small>{context.length}/1000</small>
                </div>
              </div>
              <details className="optional-guidance">
                <summary><span><Icon name="users" size={16} /></span><div><strong>Optional guidance</strong><small>Audience, tone and must-include points.</small></div><Icon name="arrow-down" size={15} /></summary>
                <p>Add these details to the context above when you want tighter control over the generated script.</p>
              </details>
              <div className={`draft-state ${creationDraftSaved ? 'saved' : ''}`}><Icon name="check" size={14} />{creationDraftSaved ? 'Draft saved locally' : 'Changes are stored when you save the draft'}</div>
            </section>

            <section className="creation-direction-column">
              <div className="creation-section-title"><span><Icon name="sparkles" size={17} /></span><h2>Creative direction</h2></div>

              <div className="creation-choice-grid">
                <button type="button" className={`studio-choice ${cfg.contentMode === 'narrated-explainer' ? 'selected' : ''}`} disabled={working} onClick={() => { setCfg(c => ({ ...c, contentMode: 'narrated-explainer' })); setCreationDraftSaved(false); }}>
                  <span className="studio-choice-icon"><Icon name="play" size={22} /></span><span><strong>Explainer</strong><small>Clear explanations that inform and engage.</small></span>
                </button>
                <button type="button" className={`studio-choice ${cfg.contentMode === 'debate' ? 'selected' : ''}`} disabled={working} onClick={() => { setCfg(c => ({ ...c, contentMode: 'debate', visualMode: 'debate' })); setCreationDraftSaved(false); }}>
                  <span className="studio-choice-icon support"><Icon name="users" size={22} /></span><span><strong>Debate</strong><small>Two sides. One topic.</small></span>
                </button>
              </div>

              <label className="studio-label">Visual style</label>
              <div className="creation-choice-grid visual-style-grid">
                <button type="button" className={`studio-visual-choice ${cfg.visualMode === 'infographic' ? 'selected' : ''}`} disabled={working} onClick={() => { setCfg(c => ({ ...c, visualMode: 'infographic', contentMode: 'narrated-explainer' })); setCreationDraftSaved(false); }}>
                  <span className="visual-preview stock"><Icon name="image" size={24} /></span><strong>Stock visuals</strong><small>Real-world footage and images.</small>
                </button>
                <button type="button" className={`studio-visual-choice ${cfg.visualMode === 'debate' ? 'selected' : ''}`} disabled={working} onClick={() => { setCfg(c => ({ ...c, visualMode: 'debate' })); setCreationDraftSaved(false); }}>
                  <span className="visual-preview characters"><Icon name="users" size={28} /></span><strong>Characters</strong><small>Illustrated hosts and scenes.</small>
                </button>
              </div>

              <label className="studio-label">Video type</label>
              <div className="creation-choice-grid video-type-grid">
                <button type="button" className={`studio-output-choice ${cfg.outputType === 'youtube' ? 'selected' : ''}`} disabled={working} onClick={() => { setCfg(c => ({ ...c, outputType: 'youtube', videoLengthMinutes: 3, extractReels: true })); setCreationDraftSaved(false); }}>
                  <Icon name="monitor" size={22} /><span><strong>YouTube video</strong><small>16:9 landscape</small></span>
                </button>
                <button type="button" className={`studio-output-choice ${cfg.outputType === 'short' ? 'selected' : ''}`} disabled={working} onClick={() => { setCfg(c => ({ ...c, outputType: 'short', videoLengthMinutes: 0.5, extractReels: false })); setCreationDraftSaved(false); }}>
                  <Icon name="smartphone" size={22} /><span><strong>Short / Reel</strong><small>9:16 vertical</small></span>
                </button>
              </div>

              <div className="length-and-reels">
                <label htmlFor="video-length">Video length</label>
                <div className="length-field"><input id="video-length" type="number" min="0.25" max="60" step="0.25" value={cfg.videoLengthMinutes} onChange={e => { setCfg(c => ({ ...c, videoLengthMinutes: Number(e.target.value) })); setCreationDraftSaved(false); }} disabled={working} /><span>minutes</span></div>
                <small>Default: 3 min for YouTube · 0.5 min for Short / Reel</small>
              </div>
              <label className="extract-reels-choice">
                <input type="checkbox" checked={cfg.subtitlesEnabled} disabled={working} onChange={e => { setCfg(c => ({ ...c, subtitlesEnabled: e.target.checked })); setCreationDraftSaved(false); }} />
                <span><strong>Show subtitles</strong><small>Display synced captions for the spoken audio.</small></span>
              </label>

              {cfg.outputType === 'youtube' && (
                <div className="extract-reels-choice included-output">
                  <span className="included-check"><Icon name="check" size={13} /></span>
                  <span><strong>Vertical reels included</strong><small>The full narration is split into as many 52-second reels as needed.</small></span>
                </div>
              )}
            </section>

            <div className="creation-summary">
              <span><i className="summary-icon"><Icon name="play" size={16} /></i><small>Format</small><strong>{cfg.contentMode === 'narrated-explainer' ? 'Explainer' : 'Debate'}</strong></span>
              <span><i className="summary-icon support"><Icon name="image" size={16} /></i><small>Visuals</small><strong>{cfg.visualMode === 'infographic' ? 'Stock' : 'Characters'}</strong></span>
              <span><i className="summary-icon support"><Icon name={cfg.outputType === 'youtube' ? 'monitor' : 'smartphone'} size={16} /></i><small>Output</small><strong>{cfg.outputType === 'youtube' ? 'YouTube video' : 'Short / Reel'}</strong></span>
              <span><i className="summary-icon"><Icon name="clock" size={16} /></i><small>Length</small><strong>{cfg.videoLengthMinutes} min{cfg.outputType === 'youtube' && cfg.extractReels ? ' + reels' : ''}</strong></span>
            </div>
          </div>

          <footer className="creation-footer">
            <button type="button" className="creation-cancel" onClick={showProjects} disabled={working}>× <span>Cancel</span></button>
            <div className="creation-final-actions">
              <div className="creation-buttons">
                <button type="button" className="next-step-button" onClick={generateNextStep} disabled={working || renderElsewhere}>{busy === 'script' ? 'Generating script…' : 'Next step'}</button>
                <button type="button" className="generate-all-button" onClick={generateAllVideos} disabled={working || renderElsewhere}>{busy === 'auto' ? 'Creating complete pack…' : <>{cfg.outputType === 'youtube' ? 'Generate video + reels' : 'Generate short'} <Icon name="sparkles" size={17} /></>}</button>
              </div>
              <small>Generate all skips review and completes every remaining step automatically.</small>
            </div>
          </footer>
        </section>
      )}

      {debate && workspaceSection === 'overview' && (
      <section className="panel project-brief">
        <h2 className="step-title">1 · Project brief</h2>
        <div className="form-section">
          <div className="field-group">
            <label htmlFor="topic">What should the video be about?</label>
            <input id="topic" value={topic} onChange={e => setTopic(e.target.value)}
                   placeholder="e.g. How the Roman Empire shaped modern cities" disabled />
          </div>
          <div className="field-group">
            <label htmlFor="context">Helpful context <span className="optional">Optional</span></label>
            <textarea id="context" value={context} onChange={e => setContext(e.target.value)}
                      placeholder="Add key facts, your point of view, target audience, or anything the script should include…"
                      disabled />
          </div>
        </div>
      </section>
      )}

      {error && <div className="error">{error}</div>}

      {debate && (
        <>
          <nav className="workspace-tabs" aria-label="Project workflow">
            {([
              ['overview', 'Overview'],
              ['storyboard', 'Editor'],
              ['metadata', 'Metadata'],
              ['shorts', 'Reels'],
              ['publish', 'Publish'],
            ] as Array<[WorkspaceSection, string]>).map(([section, label]) => (
              <button
                key={section}
                type="button"
                className={workspaceSection === section ? 'active' : ''}
                onClick={() => setWorkspaceSection(section)}
              >
                {label}
                {section === 'storyboard' && <span className="tab-status complete" />}
                {section === 'metadata' && <span className={`tab-status ${debate.metadata ? 'complete' : ''}`} />}
                {section === 'video' && <span className={`tab-status ${debate.videoExists ? 'complete' : ''}`} />}
                {section === 'shorts' && <span className={`tab-status ${reelsReady ? 'complete' : ''}`} />}
              </button>
            ))}
          </nav>

          {workspaceSection === 'overview' && <section className="status-grid" aria-label="Project status">
            <div className="status-card complete"><span>Script</span><strong>Ready</strong></div>
            <div className={`status-card ${debate.metadata ? 'complete' : ''}`}><span>Metadata</span><strong>{debate.metadata ? 'Ready' : 'Pending'}</strong></div>
            <div className={`status-card ${debate.videoExists ? 'complete' : ''}`}><span>Main video</span><strong>{debate.videoExists ? 'Ready' : 'Pending'}</strong></div>
            <div className={`status-card ${reelsReady ? 'complete' : ''}`}><span>Reels</span><strong>{debate.reelsCount}/{plannedReels || '—'}</strong></div>
            {cfg.visualMode === 'infographic' && (
              <div className={`status-card ${visualScenes.length > 0 && visualScenes.every(scene => scene.imagePath) ? 'complete' : ''}`}>
                <span>Visual scenes</span>
                <strong>{visualScenes.filter(scene => scene.imagePath).length}/{visualScenes.length || '—'}</strong>
              </div>
            )}
          </section>}

          {workspaceSection === 'overview' && completePackReady && (
            <section className="completion-panel">
              <div className="completion-mark"><Icon name="check" size={24} /></div>
              <div className="completion-copy">
                <span>Generation complete</span>
                <strong>{cfg.outputType === 'youtube' ? `Your video and ${plannedReels} reels are ready` : 'Your vertical video is ready'}</strong>
                <p>Download the complete pack or continue to publishing.</p>
              </div>
              <div className="completion-summary">
                <span><strong>1</strong>Main video</span>
                {cfg.outputType === 'youtube' && <span><strong>{debate.reelsCount}</strong>Reels</span>}
              </div>
              <div className="completion-actions">
                <button type="button" className="btn-secondary" onClick={() => setWorkspaceSection('storyboard')}>Open editor</button>
                <a className="download-pack" href={`/api/debate/${name}/download`} download>Download pack</a>
                <button type="button" onClick={() => setWorkspaceSection('publish')}>Publish</button>
              </div>
            </section>
          )}

          {workspaceSection === 'overview' && !completePackReady && (debate.videoExists || debate.reelsCount > 0) && (
            <section className="download-panel">
              <div><strong>Generation is partially complete</strong><p>Open the editor to finish the main video and all planned reels.</p></div>
              <button type="button" onClick={() => setWorkspaceSection('storyboard')}>Continue in editor</button>
            </section>
          )}

          {/* 2 — Unified editor */}
          {workspaceSection === 'storyboard' && (
          <section className="unified-editor">
            <header className="unified-editor-toolbar">
              <div>
                <span className="eyebrow">Video editor</span>
                <strong>{editScenes.length} subtitles · {visualScenes.length || 0} pictures · {formatEditorTime(editorDuration)}</strong>
              </div>
              <div className="editor-toolbar-status">
                {sceneEditsChanged ? <span className="unsaved-indicator">Unsaved script</span> : <span className="saved-indicator"><Icon name="check" size={13} /> Saved</span>}
                <button type="button" className="btn-secondary" onClick={saveScenes} disabled={working || !sceneEditsChanged || hasInvalidScenes}>{busy === 'save-scenes' ? 'Saving…' : 'Save script'}</button>
                <button type="button" onClick={generateAllFromScript} disabled={working || renderElsewhere || hasInvalidScenes}>{busy === 'auto-from-script' ? 'Creating complete pack…' : cfg.outputType === 'youtube' ? 'Generate video + reels' : 'Generate short'}</button>
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
                    <div className="editor-preview-empty"><Icon name="image" size={28} /><strong>No pictures yet</strong><p>Generate pictures to build the visual timeline.</p><button type="button" onClick={generateVisuals} disabled={!visualsConfigured || working || sceneEditsChanged}>Generate pictures</button></div>
                  )}
                </div>
                <div className="editor-preview-controls"><span>{formatEditorTime(subtitleTimeline[selectedSubtitleIndex]?.start ?? 0)} / {formatEditorTime(editorDuration)}</span><button type="button" onClick={() => playSubtitleAudio(selectedSubtitleIndex)} disabled={!audioSegments.some(segment => segment.sourceLineIndex === selectedSubtitleIndex)}>{playingSubtitleIndex === selectedSubtitleIndex ? '■' : <Icon name="play" size={17} />}</button><span>{debate.videoExists ? 'Use video controls to seek' : `Subtitle ${selectedSubtitleIndex + 1}`}</span></div>
                <div className="editor-asset-actions">
                  <button type="button" className="btn-secondary" onClick={generateVisuals} disabled={!visualsConfigured || working || sceneEditsChanged}>{visualScenes.length ? 'Regenerate pictures' : 'Generate pictures'}</button>
                  <button type="button" className="btn-secondary" onClick={generateAudio} disabled={working || sceneEditsChanged}>{debate.audioExists && audioSegments.length ? 'Regenerate audio' : 'Generate audio'}</button>
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
                  <select disabled value="automatic"><option value="automatic">Automatic slow pan &amp; zoom</option></select>
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
              <div><button type="button" className="btn-secondary" onClick={() => setWorkspaceSection('metadata')} disabled={working}>Metadata</button><button type="button" onClick={generateVideo} disabled={working || renderElsewhere || !debate.audioExists || !visualsReady || sceneEditsChanged}>Render video</button></div>
            </footer>
          </section>
          )}

          {/* 3 — Metadata */}
          {workspaceSection === 'metadata' && (
          <section className="panel metadata-panel">
            <div className="metadata-heading">
              <div><span className="step-title">3 · Metadata</span><h2>Prepare your publishing details</h2><p>Review exactly what viewers will see on YouTube and Instagram.</p></div>
              {editMetadataFields && <span className="metadata-ready"><Icon name="check" size={13} /> Generated</span>}
            </div>
            {!editMetadataFields ? (
              <div className="metadata-empty">
                <div className="sparkle"><Icon name="sparkles" size={18} /></div>
                <strong>Generate publishing details</strong>
                <p>Keeps your project title exactly and creates the description, hashtags, thumbnail hook, and reel captions.</p>
                <button onClick={generateMetadata} disabled={working}>
                  {busy === 'metadata' ? 'Generating…' : 'Generate metadata'}
                </button>
              </div>
            ) : (
              <>
                <div className="metadata-form">
                  <section className="metadata-group">
                    <div className="metadata-group-title"><span>YouTube</span><small>Main video details</small></div>
                    <label htmlFor="youtube-title">Video title <span>{editMetadataFields.youtube.title.length}/120</span></label>
                    <input id="youtube-title" maxLength={120} value={editMetadataFields.youtube.title} readOnly aria-readonly="true" />
                    <small className="hint">This always matches the title entered when the project was created.</small>
                    <label htmlFor="youtube-description">Description <span>{editMetadataFields.youtube.description.length}/5000</span></label>
                    <textarea id="youtube-description" rows={7} value={editMetadataFields.youtube.description} onChange={event => updateYoutubeMetadata('description', event.target.value)} disabled={working} />
                    <label htmlFor="youtube-hashtags">Hashtags <span>{editMetadataFields.youtube.hashtags.length}/8–12 tags</span></label>
                    <input id="youtube-hashtags" value={editMetadataFields.youtube.hashtags.join(' ')} onChange={event => updateHashtags(event.target.value)} disabled={working} placeholder="#history #education #explainer" />
                  </section>
                  <section className="metadata-group">
                    <div className="metadata-group-title"><span>Thumbnail</span><small>Short hook shown on the image</small></div>
                    <label htmlFor="thumbnail-hook">Thumbnail hook <span>{editMetadataFields.thumbnailHook.length}/80</span></label>
                    <input id="thumbnail-hook" maxLength={80} value={editMetadataFields.thumbnailHook} onChange={event => setEditMetadataFields(current => current ? { ...current, thumbnailHook: event.target.value } : current)} disabled={working} />
                    <div className="thumbnail-copy-preview"><small>Preview</small><strong>{editMetadataFields.thumbnailHook || 'Your hook appears here'}</strong></div>
                  </section>
                  <section className="metadata-group metadata-reels-group">
                    <div className="metadata-group-title"><span>Short-form captions</span><small>YouTube Shorts and Instagram Reels</small></div>
                    <div className="metadata-reel-grid">
                      {editMetadataFields.reels.map(reel => (
                        <div key={reel.part}>
                          <label htmlFor={`reel-caption-${reel.part}`}>Part {reel.part} <span>{reel.caption.length}/2200</span></label>
                          <textarea id={`reel-caption-${reel.part}`} rows={5} maxLength={2200} value={reel.caption} onChange={event => updateReelCaption(reel.part, event.target.value)} disabled={working} />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="metadata-actions">
                  <span className={metadataInvalid ? 'save-warning' : metadataChanged ? 'unsaved-indicator' : 'saved-indicator'}>
                    {metadataInvalid ? 'Complete all required fields' : metadataChanged ? 'Unsaved changes' : <><Icon name="check" size={13} /> All changes saved</>}
                  </span>
                  <div className="row">
                  <button className="btn-secondary" onClick={saveMetadata}
                          disabled={working || !metadataChanged || metadataInvalid}>
                    {busy === 'save-metadata' ? 'Saving…' : 'Save metadata'}
                  </button>
                  <button className="btn-secondary" onClick={generateMetadata} disabled={working}>
                    {busy === 'metadata' ? 'Regenerating…' : 'Regenerate'}
                  </button>
                  {debate.videoExists && reelsReady && (
                    <button onClick={continueAfterMetadata} disabled={working || renderElsewhere || metadataInvalid}>
                      Save &amp; continue to publish
                    </button>
                  )}
                  </div>
                </div>
              </>
            )}
          </section>
          )}

          {/* 4 — YouTube video */}
          {workspaceSection === 'video' && (
          <section className="panel">
            <h2 className="step-title">3 · Video</h2>

            {options && (
              <>
              <div className="settings-heading">
                <div>
                  <strong>Video setup</strong>
                  <p>Choose the visuals and voices. The recommended render settings are already applied.</p>
                </div>
                <button className="advanced-toggle" type="button" onClick={() => setShowAdvanced(value => !value)} disabled={working}>
                  {showAdvanced ? 'Hide advanced' : 'Advanced settings'} <span>{showAdvanced ? '↑' : '↓'}</span>
                </button>
              </div>
              <div className="config-grid basic-config">
                <div className="setting-summary">
                  <span>Format</span>
                  <strong>{cfg.contentMode === 'narrated-explainer' ? 'Narrated explainer' : 'Two-sided debate'}</strong>
                </div>
                <div>
                  <label>Visuals</label>
                  <select value={cfg.visualMode} disabled={working}
                          onChange={e => setCfg(c => ({ ...c, visualMode: e.target.value as RunConfig['visualMode'] }))}>
                    <option value="debate">Characters</option>
                    <option value="infographic">Stock visuals</option>
                  </select>
                </div>
                <label className="check">
                  <input type="checkbox" checked={cfg.subtitlesEnabled} disabled={working}
                         onChange={e => setCfg(c => ({ ...c, subtitlesEnabled: e.target.checked }))} />
                  Show subtitles
                </label>
                {cfg.visualMode === 'infographic' && (
                  <label className="check">
                    <input type="checkbox" checked={cfg.sceneTitlesEnabled} disabled={working}
                           onChange={e => setCfg(c => ({ ...c, sceneTitlesEnabled: e.target.checked }))} />
                    Show scene titles
                  </label>
                )}
                {(cfg.contentMode === 'narrated-explainer' ? ['HOST'] as const : ['HOST', 'A', 'B'] as const).map(sp => (
                  <div key={sp}>
                    <label>{cfg.contentMode === 'narrated-explainer' ? 'Narrator' : sp === 'HOST' ? 'Host' : `Speaker ${sp}`} voice</label>
                    <div className="voice-field">
                      <select value={cfg.voices[sp]} disabled={working} onChange={e => setVoice(sp, e.target.value)}>
                        {options.voices.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button type="button" className="preview-btn" title={`Preview ${cfg.voices[sp]}`}
                              onClick={() => previewVoice(cfg.voices[sp])}>
                        {previewing === cfg.voices[sp] ? <span className="mini-spinner" /> : <Icon name="play" size={15} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {showAdvanced && (
                <div className="advanced-panel">
                  <div className="config-grid">
                    <div>
                      <label>Video style</label>
                      <select value={cfg.videoStyle} disabled={working}
                              onChange={e => setCfg(c => ({ ...c, videoStyle: e.target.value }))}>
                        {options.videoStyles.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Subtitle style</label>
                      <select value={cfg.subtitleStyle} disabled={working || !cfg.subtitlesEnabled}
                              onChange={e => setCfg(c => ({ ...c, subtitleStyle: e.target.value }))}>
                        {options.subtitleStyles.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Voice model</label>
                      <select value={cfg.ttsModel} disabled={working}
                              onChange={e => setCfg(c => ({ ...c, ttsModel: e.target.value }))}>
                        {options.ttsModels.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Speaking speed</label>
                      <input type="number" step={0.05} min={0.25} max={4} value={cfg.ttsSpeed} disabled={working}
                             onChange={e => setCfg(c => ({ ...c, ttsSpeed: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <label className="check advanced-check">
                    <input type="checkbox" checked={useCustom} disabled={working || !cfg.subtitlesEnabled}
                           onChange={e => setUseCustom(e.target.checked)} />
                    Use custom subtitle styling
                  </label>
                  {useCustom && <div className="config-grid subtitle-controls">
                    <div>
                      <label>Position</label>
                      <select value={cs.position} disabled={working} onChange={e => setCustom('position', e.target.value)}>
                        {options.positions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Font</label>
                      <select value={cs.font} disabled={working} onChange={e => setCustom('font', e.target.value)}>
                        <option value="">(default)</option>
                        {options.fonts.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div><label>Font size</label>
                      <input type="number" min={10} max={200} value={cs.fontsize} disabled={working}
                             onChange={e => setCustom('fontsize', Number(e.target.value))} /></div>
                    <div><label>Text color</label>
                      <input value={cs.fontcolor} disabled={working} placeholder="white or 0xFFFFFF"
                             onChange={e => setCustom('fontcolor', e.target.value)} /></div>
                    <div><label>Border color</label>
                      <input value={cs.bordercolor} disabled={working} placeholder="black"
                             onChange={e => setCustom('bordercolor', e.target.value)} /></div>
                    <div><label>Border width</label>
                      <input type="number" min={0} max={20} value={cs.borderw} disabled={working}
                             onChange={e => setCustom('borderw', Number(e.target.value))} /></div>
                    <div><label>Margin (px)</label>
                      <input type="number" min={0} max={1000} value={cs.margin} disabled={working}
                             onChange={e => setCustom('margin', Number(e.target.value))} /></div>
                  </div>}
                </div>
              )}
              </>
            )}

            <section className="production-phase asset-phase">
              <header className="production-phase-heading">
                <div><span>1</span><div><strong>Prepare assets</strong><p>Pictures and audio may use external APIs. Generate them once, then render locally as often as needed.</p></div></div>
                <small>API preparation</small>
              </header>

            {cfg.visualMode === 'infographic' && (
              <div className="sub-action visual-review-section">
                <div className="visual-summary-row">
                  <div><div className="sub-head"><strong>Storyboard pictures</strong>{visualsReady && <span className="ok-tag">ready</span>}</div><p className="review-note">Each card shows exactly which numbered subtitles use that picture.</p></div>
                  <button type="button" className="btn-secondary compact" onClick={generateVisuals} disabled={!visualsConfigured || working || renderElsewhere || sceneEditsChanged || hasInvalidScenes}>
                    {job?.kind === 'visuals' ? 'Finding pictures…' : visualScenes.length > 0 ? 'Regenerate all pictures' : visualsConfigured ? 'Generate pictures' : 'Pexels key required'}
                  </button>
                </div>

                {visualScenes.length > 0 && (
                  <div className="visual-preview-grid">
                    {visualScenes.map((scene, index) => {
                      const sceneIds = new Set(scene.scriptSceneIds ?? []);
                      const subtitlesMatchedById = editScenes
                        .map((subtitle, subtitleIndex) => ({ subtitle, subtitleIndex }))
                        .filter(({ subtitle }) => sceneIds.has(subtitle.id));
                      const coveredSubtitles = subtitlesMatchedById.length > 0
                        ? subtitlesMatchedById
                        : editScenes
                          .map((subtitle, subtitleIndex) => ({ subtitle, subtitleIndex }))
                          .filter(({ subtitleIndex }) => subtitleIndex >= (scene.lineStart ?? 0)
                            && subtitleIndex <= (scene.lineEnd ?? scene.lineStart ?? 0));
                      const subtitleNumbers = coveredSubtitles.map(({ subtitleIndex }) => subtitleIndex + 1);
                      const rangeLabel = subtitleNumbers.length === 0
                        ? 'Subtitle mapping unavailable'
                        : subtitleNumbers.length === 1
                          ? `Subtitle ${subtitleNumbers[0]}`
                          : `Subtitles ${subtitleNumbers[0]}–${subtitleNumbers[subtitleNumbers.length - 1]}`;

                      return <article className="visual-preview-card" key={scene.id}>
                        <div className="visual-preview-image">
                          {scene.imagePath
                            ? <img src={`/api/debate/${name}/visuals/${scene.id}/image?t=${nonce}`} alt={scene.headline || `Scene ${index + 1}`} />
                            : <div className="visual-preview-missing"><Icon name="image" size={22} /><span>{scene.error || 'No picture generated'}</span></div>}
                          <span>Picture {index + 1}</span>
                        </div>
                        <div className="visual-preview-copy">
                          <strong>{scene.headline || `Scene ${index + 1}`}</strong>
                          <div className="visual-subtitle-coverage">
                            <span>{rangeLabel}</span>
                            {coveredSubtitles.length > 0 && (
                              <ol>
                                {coveredSubtitles.map(({ subtitle, subtitleIndex }) => (
                                  <li key={subtitle.id}><b>{subtitleIndex + 1}</b><p>{subtitle.narration || 'Empty subtitle'}</p></li>
                                ))}
                              </ol>
                            )}
                          </div>
                          <label htmlFor={`picture-query-${scene.id}`}>Image search</label>
                          <input
                            id={`picture-query-${scene.id}`}
                            value={scene.searchQuery}
                            onChange={event => setVisualScenes(items => items.map(item => item.id === scene.id ? { ...item, searchQuery: event.target.value } : item))}
                            disabled={working}
                          />
                          {scene.source && <small>Photo by <a href={scene.source.photographerUrl} target="_blank" rel="noreferrer">{scene.source.photographer}</a></small>}
                          <button type="button" className="btn-secondary" onClick={() => regenerateVisual(scene)} disabled={working || !scene.searchQuery.trim()}>
                            {busy === `visual-${scene.id}` ? 'Replacing…' : 'Replace picture'}
                          </button>
                        </div>
                      </article>;
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Thumbnail */}
            <div className="sub-action">
              <div className="sub-head"><strong>Thumbnail</strong>{debate.thumbnailExists && <span className="ok-tag">ready</span>}</div>
              {debate.metadata === null ? (
                <p className="review-note">Generate metadata first — the thumbnail uses its hook.</p>
              ) : (
                <>
                  {debate.thumbnailExists && <img className="thumb" src={`/api/debate/${name}/thumbnail?t=${nonce}`} alt="thumbnail" />}
                  {cfg.contentMode === 'narrated-explainer' && cfg.visualMode === 'infographic' && !visualsReady && (
                    <p className="review-note">Generate visual scenes first so the thumbnail can use a topic-specific image.</p>
                  )}
                  <button className="btn-secondary" onClick={generateThumbnail}
                          disabled={working || (cfg.contentMode === 'narrated-explainer' && cfg.visualMode === 'infographic' && !visualsReady)}>
                    {busy === 'thumbnail' ? 'Rendering…' : debate.thumbnailExists ? 'Regenerate thumbnail' : 'Generate thumbnail'}
                  </button>
                </>
              )}
            </div>

            {/* Audio */}
            <div className="sub-action">
              <div className="sub-head"><strong>Audio</strong>{debate.audioExists && <span className="ok-tag">ready</span>}</div>
              <p className="review-note">Uses the voices &amp; TTS settings above. Costs OpenAI TTS.</p>
              {job?.kind === 'audio' && <p className="review-note">Generating audio…</p>}
              <button onClick={generateAudio} disabled={working || renderElsewhere}>
                {job?.kind === 'audio' ? 'Generating…' : debate.audioExists ? 'Regenerate audio' : 'Generate audio'}
              </button>
            </div>
            </section>

            {/* Video */}
            <section className="production-phase render-phase">
              <header className="production-phase-heading">
                <div><span>2</span><div><strong>Render video</strong><p>Combines the prepared pictures, thumbnail, audio and subtitles using FFmpeg on this computer.</p></div></div>
                <small>No API calls</small>
              </header>
            <div className="sub-action render-action">
              <div className="sub-head"><strong>Final video</strong></div>
              {!debate.audioExists ? (
                <p className="review-note">Generate the audio first — the video is built from it.</p>
              ) : (
                <>
                  {job?.kind === 'video' && <p className="review-note">Rendering video…</p>}
                  {!visualsReady && <p className="review-note">Complete all visual scenes before rendering the infographic video.</p>}
                  {debate.videoExists && <video controls src={`/api/debate/${name}/video?t=${nonce}`} />}
                  <div className="row">
                    <button onClick={generateVideo} disabled={working || renderElsewhere || !visualsReady}>
                      {job?.kind === 'video' ? 'Rendering…' : debate.videoExists ? 'Render again' : 'Render video'}
                    </button>
                    {debate.videoExists && <a className="dl" href={`/api/debate/${name}/video`} download>Download</a>}
                  </div>
                </>
              )}
            </div>
            </section>
          </section>
          )}

          {/* 5 — Reels */}
          {workspaceSection === 'shorts' && (
          <section className="panel">
            <h2 className="step-title">4 · Reels</h2>
            {!debate.audioExists ? (
              <p className="review-note">Generate the audio first — reels reuse it.</p>
            ) : editReels.length === 0 ? (
              <button onClick={extractReels} disabled={working}>
                {busy === 'extract' ? 'Extracting…' : 'Extract reel scripts'}
              </button>
            ) : (
              <>
                {editReels.map(r => (
                  <div key={r.part} className="reel-edit">
                    <label>Part {r.part}</label>
                    <textarea className="mono" rows={7} value={r.script} disabled={working}
                              onChange={e => setEditReels(rs => rs.map(x => x.part === r.part ? { ...x, script: e.target.value } : x))} />
                    <button className="btn-secondary" onClick={() => saveReel(r.part, r.script)}
                            disabled={working || debate.reelScripts.find(x => x.part === r.part)?.script === r.script}>
                      {busy === `save-reel-${r.part}` ? 'Saving…' : `Save part ${r.part}`}
                    </button>
                  </div>
                ))}
                {job?.kind === 'reels' && <p className="review-note">Building reels…</p>}
                <div className="row">
                  <button onClick={generateReels} disabled={working || renderElsewhere}>
                    {job?.kind === 'reels' ? 'Building…' : debate.reelsCount > 0 ? 'Regenerate reels' : 'Generate reel videos'}
                  </button>
                  {autoStep === 'awaiting-reels' && (
                    <button onClick={continueAfterReels} disabled={working || renderElsewhere}>Continue → build reels</button>
                  )}
                </div>
                {debate.reelsCount > 0 && (
                  <div className="reels">
                    {Array.from({ length: debate.reelsCount }).map((_, n) => (
                      <div className="reel" key={n}>
                        <video controls src={`/api/debate/${name}/video?reel=${n}&t=${nonce}`} />
                        <a href={`/api/debate/${name}/video?reel=${n}`} download>Part {n + 1}</a>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          )}

          {/* 6 — Publish */}
          {workspaceSection === 'publish' && (
          <section className="panel">
            <h2 className="step-title">5 · Publish</h2>
            <p className="review-note">{cfg.outputType === 'short' ? '1 vertical video ready to download.' : `1 YouTube video${cfg.extractReels ? ' + 3 extracted Shorts' : ''}.`}</p>
            <div className="publish-connections">
              <div className="publish-connections-header">
                <div>
                  <strong>Publishing connections</strong>
                  <span>Tokens are checked before anything is uploaded.</span>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => call('check-publishing', async () => { await refreshPublishingReadiness('all'); })}
                  disabled={working || checkingPublishing}>
                  {checkingPublishing ? 'Checking…' : 'Check again'}
                </button>
              </div>
              <div className="publish-connection-grid">
                {(['youtube', 'instagram'] as const).map(platform => {
                  const status = publishingReadiness?.platforms[platform];
                  const label = platform === 'youtube' ? 'YouTube' : 'Instagram';
                  return (
                    <div className={`publish-connection ${status?.valid === true ? 'valid' : status?.valid === false ? 'invalid' : ''}`} key={platform}>
                      <div className="publish-connection-title">
                        <strong>{label}</strong>
                        <span>{status?.valid === true ? 'Connected' : status?.valid === false ? 'Reconnect' : 'Checking'}</span>
                      </div>
                      <p>{status?.message ?? 'Checking token status…'}</p>
                      {status?.tokenExpiresAt && <small>Token expires {formatCredentialDate(status.tokenExpiresAt)}</small>}
                      {status?.valid === true && !status.tokenExpiresAt && <small>No fixed token expiry</small>}
                      {status?.dataAccessExpiresAt && <small>Data access expires {formatCredentialDate(status.dataAccessExpiresAt)}</small>}
                    </div>
                  );
                })}
              </div>
            </div>
            {(job?.kind === 'publish' || job?.kind === 'publish-youtube') && <p className="review-note">Uploading to YouTube…</p>}
            {(job?.kind === 'publish' || job?.kind === 'publish-instagram') && <p className="review-note">Publishing to Instagram…</p>}
            {debate.publishing?.status === 'error' && debate.publishing.error && (
              <div className="error">Publishing failed: {debate.publishing.error}</div>
            )}
            {authErrorPlatform === 'youtube' && (
              <div className="publish-recovery">
                <strong>Reconnect YouTube</strong>
                <ol>
                  <li>Open <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer">Google OAuth Playground</a>.</li>
                  <li>In Settings, enable “Use your own OAuth credentials” and enter the same client ID and secret used in <code>.env</code>.</li>
                  <li>Authorize <code>https://www.googleapis.com/auth/youtube.upload</code> with the correct YouTube channel.</li>
                  <li>Exchange the code, copy the refresh token to <code>YOUTUBE_REFRESH_TOKEN</code>, then restart the app.</li>
                </ol>
              </div>
            )}
            {authErrorPlatform === 'instagram' && (
              <div className="publish-recovery">
                <strong>Reconnect Instagram</strong>
                <ol>
                  <li>Open <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Meta Graph API Explorer</a>, select your app and generate a token with the existing Instagram publishing permissions.</li>
                  <li>Open <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noreferrer">Access Token Debugger</a> and extend that token.</li>
                  <li>Use the extended token in Graph API Explorer and run <code>/me/accounts?fields=id,name,access_token,instagram_business_account</code>.</li>
                  <li>Copy the correct Page token and Instagram account ID into <code>INSTAGRAM_ACCESS_TOKEN</code> and <code>INSTAGRAM_USER_ID</code>, then restart the app.</li>
                </ol>
              </div>
            )}
            {debate.publishing?.youtube?.main && (
              <p><a href={debate.publishing.youtube.main.url} target="_blank" rel="noreferrer">Open YouTube video</a></p>
            )}
            {debate.publishing?.youtube?.shorts?.map(item => (
              <p key={item.part}>
                <a href={item.url} target="_blank" rel="noreferrer">Open YouTube Short {item.part}</a>
              </p>
            ))}
            {debate.publishing?.instagram?.map(item => (
              <p key={`instagram-${item.part}`}>
                {item.url
                  ? <a href={item.url} target="_blank" rel="noreferrer">Open Instagram Reel {item.part}</a>
                  : `Instagram Reel ${item.part} published (${item.mediaId})`}
              </p>
            ))}
            <div className="row">
              <button onClick={publishYouTube}
                      disabled={working || renderElsewhere || !debate.videoExists || (cfg.extractReels && !reelsReady) || youtubePublished}>
                {job?.kind === 'publish-youtube' ? 'Publishing YouTube…' : youtubePublished ? 'YouTube published' : 'Publish to YouTube'}
              </button>
              <button onClick={publishInstagram}
                      disabled={working || renderElsewhere || !reelsReady || instagramPublished}>
                {job?.kind === 'publish-instagram'
                  ? 'Publishing Instagram…'
                  : instagramPublished
                    ? 'Instagram published'
                    : debate.publishing?.status === 'error'
                      ? 'Retry Instagram'
                      : 'Publish to Instagram'}
              </button>
            </div>
          </section>
          )}
        </>
      )}
      </div>
    </main>
  );
}
