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
  status: 'running' | 'done' | 'error';
  stage: string;
  logs: string[];
  debateName?: string;
  error?: string;
  hasVideo: boolean;
  reelCount: number;
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [run, setRun] = useState<RunView | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const busy = starting || run?.status === 'running';

  // Stop polling if the component unmounts.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  // Ask the server for this run's state every 1.5s until it finishes.
  function poll(id: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/run/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lost track of the run.');
        setRun(data as RunView);
        if (data.status !== 'running') {
          stopPolling();
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
        body: JSON.stringify({ topic, context }),
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

        <button type="submit" disabled={busy}>
          {busy ? 'Generating…' : 'Generate video'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {run && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="steps">
            {STAGES.map((s, i) => {
              const cls =
                run.status === 'done' || (currentIndex >= 0 && i < currentIndex) ? 'done'
                : i === currentIndex ? 'active'
                : '';
              return <div key={s.key} className={`step ${cls}`}>{s.label}</div>;
            })}
          </div>

          {run.status === 'done' && run.hasVideo && (
            <>
              <video controls src={`/api/run/${run.id}/video`} />
              <div className="result-actions">
                <a href={`/api/run/${run.id}/video`} download>Download video</a>
                {run.debateName && (
                  <span className="saved-path">
                    Saved to output/publish/{run.debateName}/
                  </span>
                )}
              </div>

              {run.reelCount > 0 && (
                <>
                  <h3 style={{ margin: '28px 0 4px' }}>Reels</h3>
                  <div className="reels">
                    {Array.from({ length: run.reelCount }).map((_, n) => (
                      <div className="reel" key={n}>
                        <video controls src={`/api/run/${run.id}/video?reel=${n}`} />
                        <a href={`/api/run/${run.id}/video?reel=${n}`} download>
                          Part {n + 1}
                        </a>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {run.logs?.length > 0 && <div className="logs">{run.logs.join('\n')}</div>}
        </section>
      )}
    </main>
  );
}
