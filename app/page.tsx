'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';

interface ReelScript { part: number; script: string; }

interface ScriptScene {
  id: string;
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
  voices: { HOST: string; A: string; B: string };
  ttsModel: string;
  ttsSpeed: number;
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

interface ProjectMetadata {
  youtube: { title: string; description: string; hashtags: string[] };
  reels: Array<{ part: 1 | 2 | 3; caption: string }>;
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
  publishing: PublishState | null;
}

type PublishTarget = 'youtube' | 'instagram' | 'all';
type Theme = 'light' | 'dark';
type WorkspaceSection = 'overview' | 'storyboard' | 'metadata' | 'video' | 'shorts' | 'publish';
type ScriptView = 'review' | 'focus';
type JobKind = 'visuals' | 'audio' | 'video' | 'reels' | 'publish' | 'publish-youtube' | 'publish-instagram';
interface JobView { id: string; kind: JobKind; stage: string; status: string; attempt?: number; logs?: string[]; error?: string; }

interface ProjectSummary {
  debateName: string;
  topic: string;
  updatedAt: number;
  audioExists: boolean;
  videoExists: boolean;
  reelsCount: number;
}

// Reviewed generation pauses after the script, metadata, and reel scripts.
type AutoStep = null | 'awaiting-script' | 'awaiting-metadata' | 'awaiting-visuals' | 'running' | 'awaiting-reels';

const LS_KEY = 'activeDebate';
const THEME_KEY = 'kzr-theme';
const DEFAULT_CFG: RunConfig = {
  contentMode: 'debate',
  visualMode: 'debate',
  visualPacing: 'balanced',
  voices: { HOST: 'alloy', A: 'echo', B: 'ash' },
  ttsModel: 'tts-1',
  ttsSpeed: 1.0,
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

export default function Home() {
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [debate, setDebate] = useState<Debate | null>(null);

  const [editScenes, setEditScenes] = useState<ScriptScene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState('');
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
  const [nonstop, setNonstop] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [visualScenes, setVisualScenes] = useState<VisualScene[]>([]);
  const [visualsConfigured, setVisualsConfigured] = useState(true);
  const [globalBusy, setGlobalBusy] = useState<{ debateName: string; kind: string; stage: string } | null>(null);
  const [previewing, setPreviewing] = useState('');
  const [theme, setTheme] = useState<Theme>('light');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>('overview');
  const [scriptView, setScriptView] = useState<ScriptView>('review');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/options').then(r => r.json()).then(setOptions).catch(() => {});
    refreshProjects();
    const name = localStorage.getItem(LS_KEY);
    if (name) fetch(`/api/debate/${name}`).then(async r => {
      if (r.ok) loadDebate(await r.json());
      else localStorage.removeItem(LS_KEY);
    });
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

  useEffect(() => {
    if (debate?.debateName) refreshVisuals(debate.debateName);
    else setVisualScenes([]);
  }, [debate?.debateName]);

  async function refreshProjects() {
    try {
      const data = await jsonOrThrow(await fetch('/api/debate'));
      setProjects(data.projects ?? []);
    } catch { /* the editor remains usable if project history cannot load */ }
  }

  async function refreshVisuals(debateName: string) {
    try {
      const data = await jsonOrThrow(await fetch(`/api/debate/${debateName}/visuals`));
      setVisualsConfigured(data.configured);
      setVisualScenes(data.plan?.scenes ?? []);
    } catch { setVisualScenes([]); }
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
    const norm: Debate = {
      debateName: d.debateName,
      topic: d.topic ?? '',
      context: d.context ?? '',
      script: d.script ?? '',
      scenes: d.scenes ?? [],
      metadata: d.metadata ?? null,
      metadataFields: d.metadataFields ?? null,
      config: d.config ?? null,
      thumbnailExists: d.thumbnailExists ?? false,
      audioExists: d.audioExists ?? false,
      videoExists: d.videoExists ?? false,
      reelScripts: d.reelScripts ?? [],
      reelsCount: d.reelsCount ?? 0,
      publishing: d.publishing ?? null,
    };
    setDebate(norm);
    setTopic(norm.topic);
    setContext(norm.context);
    setEditScenes(norm.scenes);
    setSelectedSceneId(current => norm.scenes.some(scene => scene.id === current) ? current : (norm.scenes[0]?.id ?? ''));
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
    finally { setBusy(''); }
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
  const rawScript = async (): Promise<string> => {
    if (!topic.trim()) throw new Error('Please enter a topic.');
    // Capture the new-project choices before loadDebate initializes the project state.
    const selectedConfig = buildConfigPayload();
    const data = await jsonOrThrow(await fetch('/api/debate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, context, contentMode: selectedConfig.contentMode }),
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
    setDebate(d => (d ? { ...d, script: data.script, scenes: data.scenes } : d));
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
  const saveConfig = async (name = debate!.debateName) => {
    await jsonOrThrow(await fetch(`/api/debate/${name}/config`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: buildConfigPayload() }),
    }));
  };
  const rawThumbnail = async (name = debate!.debateName) => {
    await jsonOrThrow(await fetch(`/api/debate/${name}/thumbnail`, { method: 'POST' }));
    setDebate(d => (d ? { ...d, thumbnailExists: true } : d));
    setNonce(n => n + 1);
  };
  const rawVisuals = async (name = debate!.debateName) => {
    await saveConfig(name);
    try { await startJobAndWait(`/api/debate/${name}/visuals`, 'visuals', name); }
    finally { await refreshVisuals(name); }
  };
  const rawAudio = async (name = debate!.debateName) => {
    await saveConfig(name); // voices / TTS model / speed
    await startJobAndWait(`/api/debate/${name}/audio`, 'audio', name);
  };
  const rawVideoRender = async (name = debate!.debateName) => {
    await saveConfig(name); // subtitle / video style
    await startJobAndWait(`/api/debate/${name}/video`, 'video', name);
  };
  const rawExtract = async (name = debate!.debateName) => {
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/extract-reels`, { method: 'POST' }));
    setEditReels(data.parts);
    setDebate(d => (d ? { ...d, reelScripts: data.parts } : d));
  };
  const rawReels = async (name = debate!.debateName) => startJobAndWait(`/api/debate/${name}/reels`, 'reels', name);
  const rawPublish = async (target: PublishTarget, name = debate!.debateName) => {
    const readiness = await jsonOrThrow(await fetch(`/api/publish-readiness?platform=${target}`));
    if (!readiness.ready) {
      throw new Error(`Set up ${target} publishing in .env first. Missing: ${readiness.missing.join(', ')}`);
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

  // ---- auto ("Generate all") ----
  const generateAll = () => {
    if (nonstop) {
      // Run the entire pipeline end-to-end with no review pauses. The name is threaded
      // through each step so it doesn't depend on React state settling between calls.
      call('auto', async () => {
        setAuto(true); setAutoStep('running');
        try {
          const name = await rawScript();
          await rawMetadata(name);
          if (cfg.visualMode === 'infographic') await rawVisuals(name);
          await rawThumbnail(name);
          await rawAudio(name);
          await rawVideoRender(name);
          try {
            await rawExtract(name);
            await rawReels(name);
          } catch (e) {
            setError(`Video is done. Reels step failed: ${e instanceof Error ? e.message : ''}`);
          }
        } finally {
          setAuto(false); setAutoStep(null);
        }
      });
    } else {
      call('script', async () => {
        await rawScript();
        setAuto(true);
        setAutoStep('awaiting-script');
      });
    }
  };

  async function continueAfterScript() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try {
      if (JSON.stringify(editScenes) !== JSON.stringify(debate!.scenes)) await rawSaveScenes();
      await rawMetadata();
      if (cfg.visualMode === 'infographic') {
        await rawVisuals();
        await rawThumbnail();
        setAutoStep('awaiting-visuals');
        setWorkspaceSection('storyboard');
      } else {
        await rawThumbnail();
        await renderAfterReviews();
        setWorkspaceSection('video');
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
      await rawThumbnail();
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
    try { await rawExtract(); setAutoStep('awaiting-reels'); }
    catch (e) {
      setError(`Video done. Reel extraction failed: ${e instanceof Error ? e.message : ''}`);
      setAuto(false); setAutoStep(null);
    }
  }

  async function continueAfterVisuals() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try { await renderAfterReviews(); setWorkspaceSection('video'); }
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
    setDebate(null); setTopic(''); setContext('');
    setEditScenes([]); setSelectedSceneId(''); setEditMetadataFields(null); setEditReels([]);
    setVisualScenes([]);
    setJob(null); setError(''); setAuto(false); setAutoStep(null);
    setShowAdvanced(false);
    setWorkspaceSection('overview');
    setScriptView('review');
  }

  async function openProject(projectName: string) {
    if (working || projectName === name) return;
    await call('open-project', async () => {
      const data = await jsonOrThrow(await fetch(`/api/debate/${projectName}`));
      loadDebate(data);
      setWorkspaceSection('overview');
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

  const selectedScene = editScenes.find(scene => scene.id === selectedSceneId) ?? editScenes[0];
  const sceneEditsChanged = !!debate && JSON.stringify(editScenes) !== JSON.stringify(debate.scenes);
  const hasInvalidScenes = editScenes.length === 0 || editScenes.some(scene => !scene.narration.trim());
  const totalWords = editScenes.reduce((sum, scene) => sum + scene.narration.trim().split(/\s+/).filter(Boolean).length, 0);
  const estimatedSeconds = Math.max(1, Math.round(totalWords / 2.35));
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

  function updateReelCaption(part: 1 | 2 | 3, caption: string) {
    setEditMetadataFields(current => current ? {
      ...current,
      reels: current.reels.map(reel => reel.part === part ? { ...reel, caption } : reel),
    } : current);
  }

  function updateSelectedScene(patch: Partial<ScriptScene>) {
    if (!selectedScene) return;
    updateScene(selectedScene.id, patch);
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

  function addScene() {
    const id = nextSceneId();
    const previousSpeaker = editScenes.at(-1)?.speaker ?? 'B';
    const speaker: ScriptScene['speaker'] = cfg.contentMode === 'narrated-explainer'
      ? 'HOST'
      : previousSpeaker === 'A' ? 'B' : 'A';
    const scene: ScriptScene = {
      id,
      speaker,
      narration: '',
      headline: '',
      visualQuery: '',
      visualType: cfg.visualMode === 'infographic' ? 'stock-photo' : 'character',
      visualAssetPath: null,
      durationHintSeconds: null,
      overlays: [],
      status: 'draft',
    };
    setEditScenes(items => [...items, scene]);
    setSelectedSceneId(id);
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

  function duplicateScene() {
    if (!selectedScene) return;
    const id = nextSceneId();
    const copy: ScriptScene = {
      ...selectedScene,
      id,
      visualAssetPath: null,
      overlays: selectedScene.overlays.map(overlay => ({ ...overlay })),
      status: 'draft',
    };
    setEditScenes(items => {
      const index = items.findIndex(scene => scene.id === selectedScene.id);
      return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
    });
    setSelectedSceneId(id);
  }

  function deleteScene() {
    if (!selectedScene || editScenes.length <= 1) return;
    const index = editScenes.findIndex(scene => scene.id === selectedScene.id);
    const remaining = editScenes.filter(scene => scene.id !== selectedScene.id);
    setEditScenes(remaining);
    setSelectedSceneId(remaining[Math.min(index, remaining.length - 1)]?.id ?? '');
  }

  function moveScene(direction: -1 | 1) {
    if (!selectedScene) return;
    const index = editScenes.findIndex(scene => scene.id === selectedScene.id);
    const target = index + direction;
    if (target < 0 || target >= editScenes.length) return;
    setEditScenes(items => {
      const reordered = [...items];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  const working = busy !== '' || job !== null;
  const name = debate?.debateName;
  const cs = cfg.customSubtitle ?? DEFAULT_CUSTOM;
  const youtubePublished = !!debate?.publishing?.youtube?.main
    && (debate.publishing.youtube.shorts?.length ?? 0) === 3;
  const instagramPublished = (debate?.publishing?.instagram?.length ?? 0) === 3;
  // A render running on some OTHER debate (our own render is already shown via `job`).
  const renderElsewhere = !!globalBusy && globalBusy.debateName !== name;
  const visualsReady = cfg.visualMode !== 'infographic'
    || (visualScenes.length > 0 && visualScenes.every(scene => scene.imagePath));
  const assignedSceneIds = new Set<string>();
  const storyboardGroups: Array<{ id: string; visual: VisualScene | null; scenes: ScriptScene[] }> = visualScenes.map(visual => {
    const scenes = editScenes.filter((scene, index) => visual.scriptSceneIds?.includes(scene.id)
      || (visual.lineStart !== undefined && visual.lineEnd !== undefined && index >= visual.lineStart && index <= visual.lineEnd));
    scenes.forEach(scene => assignedSceneIds.add(scene.id));
    return { id: visual.id, visual, scenes };
  }).filter(group => group.scenes.length > 0);
  for (const scene of editScenes) {
    if (!assignedSceneIds.has(scene.id)) storyboardGroups.push({ id: scene.id, visual: null, scenes: [scene] });
  }

  return (
    <main className={`app-shell theme-${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="play" size={15} /></span>
          <span><b>KZR</b> Studio</span>
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={!debate ? 'nav-item active' : 'nav-item'} onClick={startNew} disabled={working}>
            <Icon name="home" size={17} /> Home
          </button>
          <a className="nav-item" href="#project-library"><Icon name="folder" size={17} /> Projects</a>
        </nav>
        <button className="new-project" onClick={startNew} disabled={working}><Icon name="plus" size={16} /> New project</button>
        <div className="sidebar-label">Recent projects</div>
        <div className="project-list">
          {projects.length === 0 && <p className="empty-projects">No projects yet.</p>}
          {projects.slice(0, 6).map(project => (
            <button
              key={project.debateName}
              className={`project-item ${project.debateName === name ? 'selected' : ''}`}
              onClick={() => openProject(project.debateName)}
              disabled={working}
            >
              <span>{project.topic}</span>
              <small>{project.videoExists ? `Video · ${project.reelsCount}/3 shorts` : project.audioExists ? 'Audio ready' : 'Draft'}</small>
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" /> Local workspace
          <small>Your files stay on this computer</small>
        </div>
      </aside>
      <div className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow">{debate ? 'Project workspace' : 'AI video workspace'}</span>
          <h1>{debate ? debate.topic || debate.debateName : 'Create a new video'}</h1>
          <p className="sub">{debate ? `${debate.debateName} · Edit, render and download your video pack.` : 'Start with a topic, choose a format, then review the draft before rendering.'}</p>
        </div>
        <div className="topbar-actions">
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

      {/* 1 — Topic */}
      {(!debate || workspaceSection === 'overview') && (
      <section className={`panel ${debate ? 'project-brief' : 'creation-panel'}`}>
        {!debate && (
          <div className="creation-heading">
            <div className="sparkle"><Icon name="sparkles" size={18} /></div>
            <div>
              <h2>Start with your idea</h2>
              <p>A clear topic and a little context are enough.</p>
            </div>
          </div>
        )}
        {!debate && (
          <div className="wizard-steps" aria-label="Video setup steps">
            <span className="current"><b>1</b> Details</span>
            <span><b>2</b> Format</span>
            <span><b>3</b> Style</span>
          </div>
        )}
        {debate && <h2 className="step-title">1 · Project brief</h2>}
        <div className="form-section">
          <div className="field-group">
            <label htmlFor="topic">What should the video be about?</label>
            <input id="topic" value={topic} onChange={e => setTopic(e.target.value)}
                   placeholder="e.g. How the Roman Empire shaped modern cities" disabled={working || !!debate} />
          </div>
          <div className="field-group">
            <label htmlFor="context">Helpful context <span className="optional">Optional</span></label>
            <textarea id="context" value={context} onChange={e => setContext(e.target.value)}
                      placeholder="Add key facts, your point of view, target audience, or anything the script should include…"
                      disabled={working || !!debate} />
          </div>
        </div>
        {!debate && (
          <>
            <div className="setup-grid">
            <div className="choice-section">
              <label>Content format</label>
              <div className="choice-grid two-up">
                <button type="button" className={`choice-card ${cfg.contentMode === 'narrated-explainer' ? 'selected' : ''}`}
                        disabled={working} onClick={() => setCfg(c => ({ ...c, contentMode: 'narrated-explainer' }))}>
                  <span className="choice-icon"><Icon name="user" size={18} /></span><strong>Explainer</strong><small>One narrator makes a topic clear</small>
                </button>
                <button type="button" className={`choice-card ${cfg.contentMode === 'debate' ? 'selected' : ''}`}
                        disabled={working} onClick={() => setCfg(c => ({ ...c, contentMode: 'debate', visualMode: 'debate' }))}>
                  <span className="choice-icon people"><Icon name="users" size={19} /></span><strong>Debate</strong><small>Two perspectives on one topic</small>
                </button>
              </div>
            </div>
            <div className="choice-section">
              <label>Visual style</label>
              <div className="choice-grid two-up">
                <button type="button" className={`choice-card visual-choice ${cfg.visualMode === 'infographic' ? 'selected' : ''}`}
                        disabled={working} onClick={() => setCfg(c => ({ ...c, visualMode: 'infographic', contentMode: 'narrated-explainer' }))}>
                  <span className="visual-swatch"><Icon name="image" size={20} /></span><strong>Stock visuals</strong><small>Photos, headlines and smooth motion</small>
                </button>
                <button type="button" className={`choice-card visual-choice ${cfg.visualMode === 'debate' ? 'selected' : ''}`}
                        disabled={working} onClick={() => setCfg(c => ({ ...c, visualMode: 'debate' }))}>
                  <span className="visual-swatch"><Icon name="users" size={20} /></span><strong>Characters</strong><small>Speaker-led studio layout</small>
                </button>
              </div>
            </div>
            </div>
            <div className="creation-actions">
              <button onClick={generateAll} disabled={working || renderElsewhere}>
                {(busy === 'auto' || (busy === 'script' && auto))
                  ? (nonstop ? 'Creating your video pack…' : 'Creating your draft…')
                  : nonstop ? 'Generate complete video pack' : 'Generate draft'}
              </button>
              <button className="btn-secondary" onClick={generateScript} disabled={working}>
                {busy === 'script' && !auto ? 'Generating…' : 'Generate script only'}
              </button>
            </div>
            <label className="check auto-check">
              <input type="checkbox" checked={nonstop} onChange={e => setNonstop(e.target.checked)} disabled={working} />
              Run automatically without review pauses
            </label>
          </>
        )}
      </section>
      )}

      {!debate && projects.length > 0 && (
        <section className="dashboard-projects" id="project-library">
          <div className="section-heading"><div><span className="eyebrow">Your workspace</span><h2>Recent projects</h2></div><span>{projects.length} total</span></div>
          <div className="project-card-grid">
            {projects.slice(0, 6).map(project => (
              <button className="dashboard-project-card" key={project.debateName} onClick={() => openProject(project.debateName)} disabled={working}>
                <span className="project-cover"><Icon name={project.videoExists ? 'play' : 'folder'} size={18} /></span>
                <span className="project-card-copy"><strong>{project.topic}</strong><small>{project.videoExists ? `Video ready · ${project.reelsCount}/3 shorts` : project.audioExists ? 'Audio ready' : 'Draft'} · {formatProjectDate(project.updatedAt)}</small></span>
                <span className="project-arrow"><Icon name="arrow-right" size={16} /></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <div className="error">{error}</div>}

      {debate && (
        <>
          <nav className="workspace-tabs" aria-label="Project workflow">
            {([
              ['overview', 'Overview'],
              ['storyboard', 'Storyboard'],
              ['video', 'Video'],
              ['shorts', 'Shorts'],
              ['metadata', 'Metadata'],
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
                {section === 'shorts' && <span className={`tab-status ${debate.reelsCount === 3 ? 'complete' : ''}`} />}
              </button>
            ))}
          </nav>

          {workspaceSection === 'overview' && <section className="status-grid" aria-label="Project status">
            <div className="status-card complete"><span>Script</span><strong>Ready</strong></div>
            <div className={`status-card ${debate.metadata ? 'complete' : ''}`}><span>Metadata</span><strong>{debate.metadata ? 'Ready' : 'Pending'}</strong></div>
            <div className={`status-card ${debate.videoExists ? 'complete' : ''}`}><span>Main video</span><strong>{debate.videoExists ? 'Ready' : 'Pending'}</strong></div>
            <div className={`status-card ${debate.reelsCount === 3 ? 'complete' : ''}`}><span>Shorts</span><strong>{debate.reelsCount}/3</strong></div>
            {cfg.visualMode === 'infographic' && (
              <div className={`status-card ${visualScenes.length > 0 && visualScenes.every(scene => scene.imagePath) ? 'complete' : ''}`}>
                <span>Visual scenes</span>
                <strong>{visualScenes.filter(scene => scene.imagePath).length}/{visualScenes.length || '—'}</strong>
              </div>
            )}
          </section>}

          {workspaceSection === 'overview' && (debate.videoExists || debate.reelsCount > 0) && (
            <section className="download-panel">
              <div>
                <strong>Your files are ready</strong>
                <p>Download one ZIP with every finished video, thumbnail, and metadata file.</p>
              </div>
              <a className="download-pack" href={`/api/debate/${name}/download`} download>Download pack</a>
            </section>
          )}

          {/* 2 — Script */}
          {workspaceSection === 'storyboard' && (
          <section className="panel scene-editor-panel">
            <div className="scene-editor-heading">
              <div>
                <span className="step-title">2 · Script editor</span>
                <h2>Shape the story, scene by scene</h2>
                <p>Edit the narration and visual direction without touching raw JSON.</p>
              </div>
              <div className="script-header-tools">
                <div className="script-summary" aria-label="Script summary">
                  <span><strong>{editScenes.length}</strong> scenes</span>
                  <span><strong>{totalWords}</strong> words</span>
                  <span><strong>~{Math.ceil(estimatedSeconds / 60)} min</strong> voice</span>
                </div>
              </div>
            </div>

            {true ? (
              <div className="storyboard-review">
                {cfg.visualMode === 'infographic' && (
                  <div className="storyboard-visual-bar">
                    <div>
                      <strong>Pictures and script together</strong>
                      <p>{visualScenes.length > 0 ? `${visualScenes.length} pictures across ${editScenes.length} subtitle segments.` : 'Choose how often the picture should change, then generate the storyboard.'}</p>
                    </div>
                    <div className="storyboard-visual-actions">
                      <label className="visual-pacing-control">
                        <span>Picture pacing</span>
                        <select value={cfg.visualPacing} disabled={working} onChange={event => setCfg(current => ({ ...current, visualPacing: event.target.value as RunConfig['visualPacing'] }))}>
                          <option value="relaxed">Relaxed · every 3 subtitles</option>
                          <option value="balanced">Balanced · every 2 subtitles</option>
                          <option value="detailed">Detailed · every subtitle</option>
                        </select>
                      </label>
                      <button type="button" className="btn-secondary compact" onClick={generateVisuals} disabled={!visualsConfigured || working || renderElsewhere || sceneEditsChanged || hasInvalidScenes}>
                        {job?.kind === 'visuals' ? 'Finding pictures…' : visualScenes.length > 0 ? 'Regenerate pictures' : visualsConfigured ? 'Generate pictures' : 'Pexels key required'}
                      </button>
                      {autoStep === 'awaiting-visuals' && <button type="button" className="compact" onClick={continueAfterVisuals} disabled={working || renderElsewhere || !visualsReady}>Continue to video</button>}
                    </div>
                  </div>
                )}
                <div className="storyboard-list">
                  {storyboardGroups.map((group, groupIndex) => {
                    const firstScene = group.scenes[0];
                    const firstIndex = editScenes.findIndex(scene => scene.id === firstScene.id);
                    const lastIndex = editScenes.findIndex(scene => scene.id === group.scenes[group.scenes.length - 1].id);
                    const visual = group.visual;
                    return (
                      <article className="storyboard-scene" key={group.id}>
                        <div className="storyboard-picture">
                          {cfg.visualMode === 'infographic' ? (
                            visual?.imagePath
                              ? <img src={`/api/debate/${name}/visuals/${visual.id}/image?t=${nonce}`} alt={firstScene.headline || `Picture ${groupIndex + 1}`} />
                              : <div className="storyboard-placeholder"><Icon name="image" size={22} /><span>No picture yet</span></div>
                          ) : (
                            <div className="storyboard-placeholder character"><Icon name="users" size={24} /><span>{firstScene.speaker === 'HOST' ? 'Host' : `Speaker ${firstScene.speaker}`}</span></div>
                          )}
                          <span className="storyboard-index">{firstIndex === lastIndex ? String(firstIndex + 1).padStart(2, '0') : `${String(firstIndex + 1).padStart(2, '0')}–${String(lastIndex + 1).padStart(2, '0')}`}</span>
                          {group.scenes.length > 1 && <span className="shared-visual">{group.scenes.length} subtitles</span>}
                        </div>
                        <div className="storyboard-copy">
                          <div className="storyboard-group-headline">
                            <label htmlFor={`headline-${group.id}`}>On-screen headline · shared with this picture</label>
                            <input
                              id={`headline-${group.id}`}
                              value={firstScene.headline}
                              onChange={event => {
                                const sceneIds = new Set(group.scenes.map(scene => scene.id));
                                setEditScenes(items => items.map(scene => sceneIds.has(scene.id) ? { ...scene, headline: event.target.value } : scene));
                              }}
                              disabled={working}
                              placeholder="Short visual headline"
                            />
                          </div>
                          {group.scenes.map(scene => {
                            const index = editScenes.findIndex(item => item.id === scene.id);
                            return <div className="storyboard-script-segment" key={scene.id}>
                              <div className="storyboard-row-heading">
                                <span>Subtitle {index + 1} · {scene.speaker === 'HOST' ? 'Narrator' : `Speaker ${scene.speaker}`}</span>
                                <div className="storyboard-scene-tools" aria-label={`Actions for subtitle ${index + 1}`}>
                                  <button type="button" onClick={() => moveStoryboardScene(scene.id, -1)} disabled={working || index === 0} title="Move up" aria-label="Move subtitle up"><Icon name="arrow-up" size={14} /></button>
                                  <button type="button" onClick={() => moveStoryboardScene(scene.id, 1)} disabled={working || index === editScenes.length - 1} title="Move down" aria-label="Move subtitle down"><Icon name="arrow-down" size={14} /></button>
                                  <button type="button" onClick={() => duplicateStoryboardScene(scene.id)} disabled={working} title="Duplicate" aria-label="Duplicate subtitle"><Icon name="copy" size={14} /></button>
                                  <button type="button" className="danger-tool" onClick={() => deleteStoryboardScene(scene.id)} disabled={working || editScenes.length <= 1} title="Delete" aria-label="Delete subtitle"><Icon name="trash" size={14} /></button>
                                </div>
                              </div>
                              <label htmlFor={`narration-${scene.id}`}>Narration</label>
                              <textarea id={`narration-${scene.id}`} value={scene.narration} onChange={event => updateScene(scene.id, { narration: event.target.value })} disabled={working} placeholder="Narration for this subtitle…" />
                            </div>
                          })}
                          {cfg.visualMode === 'infographic' && (
                            <div className="storyboard-visual-controls">
                              <div>
                                <label htmlFor={`visual-${group.id}`}>Picture shared by {group.scenes.length} subtitle{group.scenes.length === 1 ? '' : 's'}</label>
                                <input
                                  id={`visual-${group.id}`}
                                  value={visual?.searchQuery ?? firstScene.visualQuery}
                                  onChange={event => visual
                                    ? setVisualScenes(items => items.map(item => item.id === visual.id ? { ...item, searchQuery: event.target.value } : item))
                                    : updateScene(firstScene.id, { visualQuery: event.target.value })}
                                  disabled={working}
                                  placeholder="Describe the picture"
                                />
                              </div>
                              {visual && <button type="button" className="btn-secondary" onClick={() => regenerateVisual(visual)} disabled={working}>{busy === `visual-${visual.id}` ? 'Replacing…' : 'Replace'}</button>}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  <button type="button" className="storyboard-add" onClick={addScene} disabled={working}><Icon name="plus" size={15} /> Add scene</button>
                </div>
              </div>
            ) : (
            <div className="scene-editor">
              <aside className="scene-list-panel" aria-label="Script scenes">
                <div className="scene-list-heading">
                  <span>Scenes</span>
                  <button className="scene-add-button" type="button" onClick={addScene} disabled={working}>
                    <Icon name="plus" size={14} /> Add
                  </button>
                </div>
                <div className="scene-list">
                  {editScenes.map((scene, index) => (
                    <button
                      type="button"
                      key={scene.id}
                      className={`scene-list-item ${scene.id === selectedScene?.id ? 'selected' : ''}`}
                      onClick={() => setSelectedSceneId(scene.id)}
                      disabled={working}
                    >
                      <span className="scene-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="scene-list-copy">
                        <span className="scene-list-meta">
                          <strong>{scene.headline.trim() || `Scene ${index + 1}`}</strong>
                          <small>{scene.speaker === 'HOST' ? 'Narrator' : `Speaker ${scene.speaker}`}</small>
                        </span>
                        <span className="scene-preview">{scene.narration.trim() || 'Add narration…'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              {selectedScene && (
                <div className="scene-detail-panel">
                  <div className="scene-toolbar">
                    <div>
                      <span className="editor-kicker">Selected scene</span>
                      <strong>Scene {editScenes.findIndex(scene => scene.id === selectedScene.id) + 1}</strong>
                    </div>
                    <div className="scene-tools" aria-label="Scene actions">
                      <button type="button" onClick={() => moveScene(-1)} disabled={working || editScenes[0]?.id === selectedScene.id} title="Move scene up" aria-label="Move scene up"><Icon name="arrow-up" size={15} /></button>
                      <button type="button" onClick={() => moveScene(1)} disabled={working || editScenes[editScenes.length - 1]?.id === selectedScene.id} title="Move scene down" aria-label="Move scene down"><Icon name="arrow-down" size={15} /></button>
                      <button type="button" onClick={duplicateScene} disabled={working} title="Duplicate scene" aria-label="Duplicate scene"><Icon name="copy" size={15} /></button>
                      <button type="button" className="danger-tool" onClick={deleteScene} disabled={working || editScenes.length <= 1} title="Delete scene" aria-label="Delete scene"><Icon name="trash" size={15} /></button>
                    </div>
                  </div>

                  <div className="scene-fields-grid">
                    <div>
                      <label htmlFor="scene-speaker">Voice</label>
                      <select
                        id="scene-speaker"
                        value={selectedScene.speaker}
                        onChange={event => updateSelectedScene({ speaker: event.target.value as ScriptScene['speaker'] })}
                        disabled={working || cfg.contentMode === 'narrated-explainer'}
                      >
                        {cfg.contentMode === 'narrated-explainer'
                          ? <option value="HOST">Narrator</option>
                          : <><option value="A">Speaker A</option><option value="B">Speaker B</option></>}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="scene-headline">On-screen headline</label>
                      <input id="scene-headline" value={selectedScene.headline} onChange={event => updateSelectedScene({ headline: event.target.value })} disabled={working} placeholder="Short, clear headline" />
                    </div>
                  </div>

                  <label htmlFor="scene-narration">Narration</label>
                  <textarea
                    id="scene-narration"
                    className="scene-narration"
                    value={selectedScene.narration}
                    onChange={event => updateSelectedScene({ narration: event.target.value })}
                    disabled={working}
                    placeholder="Write what the audience will hear in this scene…"
                  />
                  <div className="field-footnote">
                    <span>{selectedScene.narration.trim().split(/\s+/).filter(Boolean).length} words</span>
                    <span>Keep one clear idea per scene</span>
                  </div>

                  {cfg.visualMode === 'infographic' && (
                    <div className="visual-direction-field">
                      <label htmlFor="scene-visual-query">Visual direction</label>
                      <input id="scene-visual-query" value={selectedScene.visualQuery} onChange={event => updateSelectedScene({ visualQuery: event.target.value })} disabled={working} placeholder="e.g. aerial view of a solar farm at sunrise" />
                      <p>Describe the image to find for this part of the story.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            <div className="scene-editor-actions">
              <div>
                {hasInvalidScenes && <span className="save-warning">Every scene needs narration.</span>}
                {!hasInvalidScenes && sceneEditsChanged && <span className="unsaved-indicator">Unsaved changes</span>}
                {!hasInvalidScenes && !sceneEditsChanged && <span className="saved-indicator"><Icon name="check" size={13} /> All changes saved</span>}
              </div>
              <div className="row">
                <button className="btn-secondary" onClick={saveScenes} disabled={working || !sceneEditsChanged || hasInvalidScenes}>
                  {busy === 'save-scenes' ? 'Saving…' : 'Save changes'}
                </button>
                {autoStep === 'awaiting-script' && (
                  <button onClick={continueAfterScript} disabled={working || renderElsewhere || hasInvalidScenes}>
                    Continue → prepare visuals
                  </button>
                )}
              </div>
            </div>
          </section>
          )}

          {/* 3 — Metadata */}
          {workspaceSection === 'metadata' && (
          <section className="panel metadata-panel">
            <div className="metadata-heading">
              <div><span className="step-title">5 · Metadata</span><h2>Prepare your publishing details</h2><p>Review exactly what viewers will see on YouTube and Instagram.</p></div>
              {editMetadataFields && <span className="metadata-ready"><Icon name="check" size={13} /> Generated</span>}
            </div>
            {!editMetadataFields ? (
              <div className="metadata-empty">
                <div className="sparkle"><Icon name="sparkles" size={18} /></div>
                <strong>Generate your titles and captions</strong>
                <p>Creates a YouTube title, description, hashtags, thumbnail hook, and three reel captions.</p>
                <button onClick={generateMetadata} disabled={working}>
                  {busy === 'metadata' ? 'Generating…' : 'Generate metadata'}
                </button>
              </div>
            ) : (
              <>
                <div className="metadata-form">
                  <section className="metadata-group">
                    <div className="metadata-group-title"><span>YouTube</span><small>Main video details</small></div>
                    <label htmlFor="youtube-title">Video title <span>{editMetadataFields.youtube.title.length}/70</span></label>
                    <input id="youtube-title" maxLength={70} value={editMetadataFields.youtube.title} onChange={event => updateYoutubeMetadata('title', event.target.value)} disabled={working} />
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
                  {debate.videoExists && debate.reelsCount === 3 && (
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
                      <select value={cfg.subtitleStyle} disabled={working}
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
                    <input type="checkbox" checked={useCustom} disabled={working}
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

            {cfg.visualMode === 'infographic' && (
              <div className="sub-action visual-summary-row">
                <div><div className="sub-head"><strong>Storyboard pictures</strong>{visualsReady && <span className="ok-tag">ready</span>}</div><p className="review-note">Pictures are reviewed alongside the narration in Storyboard.</p></div>
                <button type="button" className="btn-secondary compact" onClick={() => setWorkspaceSection('storyboard')}>Open storyboard</button>
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

            {/* Video */}
            <div className="sub-action">
              <div className="sub-head"><strong>Video</strong></div>
              {!debate.audioExists ? (
                <p className="review-note">Generate the audio first — the video is built from it.</p>
              ) : (
                <>
                  {job?.kind === 'video' && <p className="review-note">Rendering video…</p>}
                  {!visualsReady && <p className="review-note">Complete all visual scenes before rendering the infographic video.</p>}
                  {debate.videoExists && <video controls src={`/api/debate/${name}/video?t=${nonce}`} />}
                  <div className="row">
                    <button onClick={generateVideo} disabled={working || renderElsewhere || !visualsReady}>
                      {job?.kind === 'video' ? 'Rendering…' : debate.videoExists ? 'Regenerate video' : 'Generate video'}
                    </button>
                    {debate.videoExists && <a className="dl" href={`/api/debate/${name}/video`} download>Download</a>}
                  </div>
                </>
              )}
            </div>
          </section>
          )}

          {/* 5 — Reels */}
          {workspaceSection === 'shorts' && (
          <section className="panel">
            <h2 className="step-title">4 · Shorts</h2>
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
            <h2 className="step-title">6 · Publish</h2>
            <p className="review-note">1 main video + 3 Shorts → YouTube · 3 Reels → Instagram</p>
            {(job?.kind === 'publish' || job?.kind === 'publish-youtube') && <p className="review-note">Uploading to YouTube…</p>}
            {(job?.kind === 'publish' || job?.kind === 'publish-instagram') && <p className="review-note">Publishing to Instagram…</p>}
            {debate.publishing?.status === 'error' && debate.publishing.error && (
              <div className="error">Publishing failed: {debate.publishing.error}</div>
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
                      disabled={working || renderElsewhere || !debate.videoExists || debate.reelsCount !== 3 || youtubePublished}>
                {job?.kind === 'publish-youtube' ? 'Publishing YouTube…' : youtubePublished ? 'YouTube published' : 'Publish to YouTube'}
              </button>
              <button onClick={publishInstagram}
                      disabled={working || renderElsewhere || debate.reelsCount !== 3 || instagramPublished}>
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
