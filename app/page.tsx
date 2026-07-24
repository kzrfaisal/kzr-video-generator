'use client';

import { useEffect, useRef, useState } from 'react';

// The visible stages, in order. Must match the `Stage` values runPipeline.ts emits.
const STAGES = [
  { key: 'script', label: 'Script' },
  { key: 'thumbnail', label: 'Thumbnail' },
  { key: 'audio', label: 'Audio' },
  { key: 'video', label: 'Video' },
  { key: 'reels', label: 'Reels' },
] as const;

// Shape returned by GET /api/run/[id] (see lib/runs.ts → publicView).
interface RunView {
  id: string;
  status: 'running' | 'awaiting_review' | 'done' | 'error';
  stage: string;
  logs: string[];
  debateName?: string;
  scriptText?: string;
  metadataText?: string;
  error?: string;
  hasVideo: boolean;
  reelCount: number;
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [review, setReview] = useState(true);
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  // Editable drafts shown during the review pause.
  const [editScript, setEditScript] = useState('');
  const [editMetadata, setEditMetadata] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reviewing = run?.status === 'awaiting_review';
  const busy = starting || run?.status === 'running' || reviewing;

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // When the run parks for review, seed the editor with the generated draft.
  useEffect(() => {
    if (reviewing) {
      setEditScript(run?.scriptText ?? '');
      setEditMetadata(run?.metadataText ?? '');
    }
  }, [reviewing, run?.scriptText, run?.metadataText]);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  // Poll the run's state until it finishes OR parks for review.
  function poll(id: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/run/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lost track of the run.');
        setRun(data as RunView);
        if (data.status !== 'running') {
          stopPolling(); // 'awaiting_review', 'done', or 'error' — nothing to poll for now
          if (data.status === 'error') setError(data.error || 'Generation failed.');
        }
      } catch (err) {
        stopPolling();
        setError(err instanceof Error ? err.message : 'Polling failed.');
      }
    }, 1500);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!topic.trim()) { setError('Please enter a topic.'); return; }
    setStarting(true);
    setRun(null);
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, context, review }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start.');
      poll(data.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start.');
    } finally {
      setStarting(false);
    }
  }

  async function approve() {
    if (!run) return;
    setError('');
    try {
      const res = await fetch(`/api/run/${run.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: editScript, metadata: editMetadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start rendering.');
      setRun(prev => (prev ? { ...prev, status: 'running', stage: 'thumbnail' } : prev));
      poll(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start rendering.');
    }
  }

  const currentIndex = run ? STAGES.findIndex(s => s.key === run.stage) : -1;

  return (
    <main className="wrap">
      <h1>Debate Video Generator</h1>
      <p className="sub">Type a topic and generate a debate video.</p>

      <form className="panel" onSubmit={start}>
        <label htmlFor="topic">Topic</label>
        <input
          id="topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. AI replacing teachers"
          disabled={busy}
        />

        <label htmlFor="context">
          Context <span className="optional">(optional)</span>
        </label>
        <textarea
          id="context"
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="Optional framing or a real event to anchor the debate…"
          disabled={busy}
        />
        <div className="hint">Steers the angle. Leave blank for a generic take.</div>

        <label className="check">
          <input
            type="checkbox"
            checked={review}
            onChange={e => setReview(e.target.checked)}
            disabled={busy}
          />
          Review the script before rendering
        </label>

        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : 'Generate video'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {run && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="steps">
            {STAGES.map((s, i) => {
              const done = run.status === 'done'
                || (currentIndex >= 0 && i < currentIndex)
                || (reviewing && s.key === 'script');
              const active = !reviewing && i === currentIndex && run.status === 'running';
              return (
                <div key={s.key} className={`step ${done ? 'done' : active ? 'active' : ''}`}>
                  {s.label}
                </div>
              );
            })}
          </div>

          {reviewing && (
            <div className="review">
              <p className="review-note">
                Draft ready. Edit the script and thumbnail hook if you like, then render.
              </p>
              <label htmlFor="script">Script</label>
              <textarea
                id="script"
                className="mono"
                value={editScript}
                onChange={e => setEditScript(e.target.value)}
                rows={14}
              />
              <label htmlFor="metadata">Metadata <span className="optional">(YouTube title/description, hashtags, thumbnail hook)</span></label>
              <textarea
                id="metadata"
                className="mono"
                value={editMetadata}
                onChange={e => setEditMetadata(e.target.value)}
                rows={10}
              />
              <button type="button" onClick={approve}>Approve &amp; render</button>
            </div>
          )}

          {run.status === 'done' && run.hasVideo && (
            <>
              <video controls src={`/api/run/${run.id}/video`} />
              <div className="result-actions">
                <a href={`/api/run/${run.id}/video`} download>Download video</a>
                {run.debateName && (
                  <span className="saved-path">Saved to output/publish/{run.debateName}/</span>
                )}
              </div>

              {run.reelCount > 0 && (
                <>
                  <h3 style={{ margin: '28px 0 4px' }}>Reels</h3>
                  <div className="reels">
                    {Array.from({ length: run.reelCount }).map((_, n) => (
                      <div className="reel" key={n}>
                        <video controls src={`/api/run/${run.id}/video?reel=${n}`} />
                        <a href={`/api/run/${run.id}/video?reel=${n}`} download>Part {n + 1}</a>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {run.logs?.length > 0 && !reviewing && <div className="logs">{run.logs.join('\n')}</div>}
        </section>
      )}
    </main>
  );
}
