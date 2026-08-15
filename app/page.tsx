'use client';

import { useEffect, useRef, useState } from 'react';

interface ReelScript { part: number; script: string; }

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

interface Debate {
  debateName: string;
  topic: string;
  context: string;
  script: string;
  metadata: string | null;
  config: Partial<RunConfig> | null;
  thumbnailExists: boolean;
  audioExists: boolean;
  videoExists: boolean;
  reelScripts: ReelScript[];
  reelsCount: number;
  publishing: PublishState | null;
}

type PublishTarget = 'youtube' | 'instagram' | 'all';
type JobKind = 'audio' | 'video' | 'reels' | 'publish' | 'publish-youtube' | 'publish-instagram';
interface JobView { id: string; kind: JobKind; stage: string; status: string; error?: string; }

// Auto ("Generate all") pauses at two gates: after the script, and after the reel scripts.
type AutoStep = null | 'awaiting-script' | 'running' | 'awaiting-reels';

const LS_KEY = 'activeDebate';
const DEFAULT_CFG: RunConfig = {
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

export default function Home() {
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [debate, setDebate] = useState<Debate | null>(null);

  const [editScript, setEditScript] = useState('');
  const [editMetadata, setEditMetadata] = useState('');
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
  const [globalBusy, setGlobalBusy] = useState<{ debateName: string; kind: string; stage: string } | null>(null);
  const [previewing, setPreviewing] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch('/api/options').then(r => r.json()).then(setOptions).catch(() => {});
    const name = localStorage.getItem(LS_KEY);
    if (name) fetch(`/api/debate/${name}`).then(async r => {
      if (r.ok) loadDebate(await r.json());
      else localStorage.removeItem(LS_KEY);
    });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

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
      metadata: d.metadata ?? null,
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
    setEditScript(norm.script);
    setEditMetadata(norm.metadata ?? '');
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
    if (res.ok) loadDebate(await res.json());
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
    const { jobId } = await jsonOrThrow(await fetch(startUrl, {
      method: 'POST',
      ...(requestBody === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }),
    }));
    setJob({ id: jobId, kind, stage: kind, status: 'running' });
    await new Promise<void>((resolve, reject) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const j = await (await fetch(`/api/job/${jobId}`)).json();
          setJob({ id: jobId, kind, stage: j.stage, status: j.status, error: j.error });
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
    const data = await jsonOrThrow(await fetch('/api/debate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, context }),
    }));
    loadDebate(data);
    return data.debateName as string;
  };
  const rawSaveScript = async (name = debate!.debateName) => {
    await jsonOrThrow(await fetch(`/api/debate/${name}/script`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: editScript }),
    }));
    setDebate(d => (d ? { ...d, script: editScript } : d));
  };
  const rawMetadata = async (name = debate!.debateName) => {
    const data = await jsonOrThrow(await fetch(`/api/debate/${name}/metadata`, { method: 'POST' }));
    setEditMetadata(data.metadata);
    setDebate(d => (d ? { ...d, metadata: data.metadata } : d));
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
  const saveScript = () => call('save-script', rawSaveScript);
  const generateMetadata = () => call('metadata', rawMetadata);
  const saveMetadata = () => call('save-metadata', async () => {
    await jsonOrThrow(await fetch(`/api/debate/${debate!.debateName}/metadata`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: editMetadata }),
    }));
    setDebate(d => (d ? { ...d, metadata: editMetadata } : d));
  });
  const generateThumbnail = () => call('thumbnail', rawThumbnail);
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

  const generateAndPublish = () => call('auto-publish', async () => {
    setAuto(true); setAutoStep('running');
    try {
      const name = await rawScript();
      await rawMetadata(name);
      await rawThumbnail(name);
      await rawAudio(name);
      await rawVideoRender(name);
      await rawExtract(name);
      await rawReels(name);
      await rawPublish('all', name);
    } finally {
      setAuto(false); setAutoStep(null);
    }
  });

  // ---- auto ("Generate all") ----
  const generateAll = () => {
    if (nonstop) {
      // Run the entire pipeline end-to-end with no review pauses. The name is threaded
      // through each step so it doesn't depend on React state settling between calls.
      call('auto', async () => {
        setAuto(true); setAutoStep('running');
        const name = await rawScript();
        await rawMetadata(name);
        await rawThumbnail(name);
        await rawAudio(name);
        await rawVideoRender(name);
        try {
          await rawExtract(name);
          await rawReels(name);
        } catch (e) {
          setError(`Video is done. Reels step failed: ${e instanceof Error ? e.message : ''}`);
        }
        setAuto(false); setAutoStep(null);
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
      if (editScript !== debate!.script) await rawSaveScript();
      await rawMetadata();
      await rawThumbnail();
      await rawAudio();
      await rawVideoRender();
      try { await rawExtract(); setAutoStep('awaiting-reels'); }
      catch (e) {
        setError(`Video done. Reel extraction failed: ${e instanceof Error ? e.message : ''}`);
        setAuto(false); setAutoStep(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto run failed.');
      setAutoStep('awaiting-script');
    } finally { setBusy(''); }
  }

  async function continueAfterReels() {
    setError(''); setBusy('auto'); setAutoStep('running');
    try { await rawReels(); setAuto(false); setAutoStep(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Reel build failed.'); setAutoStep('awaiting-reels'); }
    finally { setBusy(''); }
  }

  function startNew() {
    localStorage.removeItem(LS_KEY);
    setDebate(null); setTopic(''); setContext('');
    setEditScript(''); setEditMetadata(''); setEditReels([]);
    setJob(null); setError(''); setAuto(false); setAutoStep(null);
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

  const working = busy !== '' || job !== null;
  const name = debate?.debateName;
  const cs = cfg.customSubtitle ?? DEFAULT_CUSTOM;
  const youtubePublished = !!debate?.publishing?.youtube?.main
    && (debate.publishing.youtube.shorts?.length ?? 0) === 3;
  const instagramPublished = (debate?.publishing?.instagram?.length ?? 0) === 3;
  // A render running on some OTHER debate (our own render is already shown via `job`).
  const renderElsewhere = !!globalBusy && globalBusy.debateName !== name;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <h1>Debate Video Generator</h1>
          <p className="sub">{debate ? `Working on ${debate.debateName}` : 'Start a new debate video.'}</p>
        </div>
        {debate && <button className="btn-secondary" onClick={startNew} disabled={working}>Start new</button>}
      </div>

      {renderElsewhere && (
        <div className="busy-banner">
          A render is in progress on <strong>{globalBusy!.debateName}</strong> ({globalBusy!.kind} · {globalBusy!.stage}).
          Video and reel buttons are paused until it finishes.
        </div>
      )}

      {/* 1 — Topic */}
      <section className="panel">
        <h2 className="step-title">1 · Title and context</h2>
        <label htmlFor="topic">Debate title/topic</label>
        <input id="topic" value={topic} onChange={e => setTopic(e.target.value)}
               placeholder="e.g. AI replacing teachers" disabled={working || !!debate} />
        <label htmlFor="context">Context <span className="optional">(optional)</span></label>
        <textarea id="context" value={context} onChange={e => setContext(e.target.value)}
                  placeholder="Optional framing or a real event to anchor the debate…"
                  disabled={working || !!debate} />
        {!debate && (
          <>
            <div className="row">
              <button onClick={generateAndPublish} disabled={working || renderElsewhere}>
                {busy === 'auto-publish' ? 'Creating & publishing…' : 'Create & publish everything'}
              </button>
              <button onClick={generateScript} disabled={working}>
                {busy === 'script' && !auto ? 'Generating…' : 'Generate script'}
              </button>
              <button className="btn-secondary" onClick={generateAll} disabled={working || renderElsewhere}>
                {(busy === 'auto' || (busy === 'script' && auto)) ? 'Generating…' : 'Generate all'}
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={nonstop} onChange={e => setNonstop(e.target.checked)} disabled={working} />
              Non-stop — with “Generate all”, run everything with no review pauses
            </label>
          </>
        )}
      </section>

      {error && <div className="error">{error}</div>}

      {debate && (
        <>
          {/* 2 — Script */}
          <section className="panel">
            <h2 className="step-title">2 · Script</h2>
            <textarea className="mono" rows={14} value={editScript}
                      onChange={e => setEditScript(e.target.value)} disabled={working} />
            <div className="row">
              <button className="btn-secondary" onClick={saveScript}
                      disabled={working || editScript === debate.script}>
                {busy === 'save-script' ? 'Saving…' : 'Save script'}
              </button>
              {autoStep === 'awaiting-script' && (
                <button onClick={continueAfterScript} disabled={working || renderElsewhere}>
                  Continue → metadata &amp; video
                </button>
              )}
            </div>
          </section>

          {/* 3 — Metadata */}
          <section className="panel">
            <h2 className="step-title">3 · Metadata</h2>
            {debate.metadata === null ? (
              <>
                <p className="review-note">YouTube title, description, hashtags, reel captions, thumbnail hook.</p>
                <button onClick={generateMetadata} disabled={working}>
                  {busy === 'metadata' ? 'Generating…' : 'Generate metadata'}
                </button>
              </>
            ) : (
              <>
                <textarea className="mono" rows={10} value={editMetadata}
                          onChange={e => setEditMetadata(e.target.value)} disabled={working} />
                <div className="row">
                  <button className="btn-secondary" onClick={saveMetadata}
                          disabled={working || editMetadata === debate.metadata}>
                    {busy === 'save-metadata' ? 'Saving…' : 'Save metadata'}
                  </button>
                  <button className="btn-secondary" onClick={generateMetadata} disabled={working}>
                    {busy === 'metadata' ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 4 — YouTube video */}
          <section className="panel">
            <h2 className="step-title">4 · YouTube video</h2>

            {options && (
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
                  <label>TTS model</label>
                  <select value={cfg.ttsModel} disabled={working}
                          onChange={e => setCfg(c => ({ ...c, ttsModel: e.target.value }))}>
                    {options.ttsModels.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label>Speed</label>
                  <input type="number" step={0.05} min={0.25} max={4} value={cfg.ttsSpeed} disabled={working}
                         onChange={e => setCfg(c => ({ ...c, ttsSpeed: Number(e.target.value) }))} />
                </div>
                {(['HOST', 'A', 'B'] as const).map(sp => (
                  <div key={sp}>
                    <label>{sp === 'HOST' ? 'Host' : `Speaker ${sp}`} voice</label>
                    <div className="voice-field">
                      <select value={cfg.voices[sp]} disabled={working} onChange={e => setVoice(sp, e.target.value)}>
                        {options.voices.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button type="button" className="preview-btn" title={`Preview ${cfg.voices[sp]}`}
                              onClick={() => previewVoice(cfg.voices[sp])}>
                        {previewing === cfg.voices[sp] ? '⏳' : '▶'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {options && (
              <div className="custom-sub">
                <label className="check">
                  <input type="checkbox" checked={useCustom} disabled={working}
                         onChange={e => setUseCustom(e.target.checked)} />
                  Customize subtitle (overrides the subtitle style above)
                </label>
                {useCustom && (
                  <div className="config-grid">
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
                  <button className="btn-secondary" onClick={generateThumbnail} disabled={working}>
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
                  {debate.videoExists && <video controls src={`/api/debate/${name}/video?t=${nonce}`} />}
                  <div className="row">
                    <button onClick={generateVideo} disabled={working || renderElsewhere}>
                      {job?.kind === 'video' ? 'Rendering…' : debate.videoExists ? 'Regenerate video' : 'Generate video'}
                    </button>
                    {debate.videoExists && <a className="dl" href={`/api/debate/${name}/video`} download>Download</a>}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 5 — Reels */}
          <section className="panel">
            <h2 className="step-title">5 · Reels</h2>
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

          {/* 6 — Publish */}
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
        </>
      )}
    </main>
  );
}
