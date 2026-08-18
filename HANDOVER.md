# HANDOVER — kzr-video-generator

## 1. What it is
A TypeScript/Node app that turns a one-line topic into a full **debate video** (two AI
speakers) + **3 vertical reels**, with subtitles, per-speaker AI voices, a thumbnail, and
YouTube metadata. It began as a CLI and now has a **Next.js web UI** wrapped around the
same pipeline. Single-user, runs locally. OpenAI for text+TTS; **ffmpeg** for all video.

- Repo: `/Users/kzrfaisal/kzr/projects/kzr-video-generator`
- Requires: Node, `ffmpeg` on PATH, `.env` with `OPENAI_API_KEY`

## 2. Run it
- **Web UI:** `npm run next:dev` → http://localhost:3000  (also `next:build` / `next:start`)
- **CLI (still works):** `npm start "<topic>"` (YouTube only), `npm run all "<topic>"`
  (YouTube + reels). Other scripts in `package.json`.
- **Typecheck:** `npx tsc --noEmit`

## 3. Architecture — the key idea
The web app does **NOT import** the heavy pipeline. It **spawns it as a child process**:
`spawn('npx', ['tsx', 'src/features/pipeline/runPipeline.ts', <subcommand>, …])`. Data crosses the boundary
as **CLI args in**, **`@@MARKER@@` stdout lines + files on disk out**. Only *pure* modules
and local adapters are imported directly by Next.

Why spawn (not import): the pipeline has a module-level `config` singleton set per-process,
uses blocking `spawnSync` for ffmpeg, and was already a working CLI — separate processes
give config isolation + crash isolation. (A from-scratch design would make the pipeline
importable async functions run in a worker+queue; noted for later.)

Flow per stage: **browser → API route → spawn `runPipeline <stage>` → reads result from
disk → UI updates.** Quick stages are awaited; long stages run as background jobs the
browser polls.

## 4. The pipeline
`src/features/pipeline/runPipeline.ts` is the web entry point; subcommands:
`script | metadata | thumbnail | audio | video | extract-reels | reels-build`.
Underlying modules:
- `features/scripts/` — structured explainer/debate script and metadata generation
- `features/visuals/` — visual planning, Pexels images, infographic overlays, and thumbnail
- `features/rendering/` — TTS, ffmpeg segments/transitions, and final video assembly
- `features/reels/` — short-form extraction and rendering
- `features/publishing/` — YouTube and Instagram delivery
- `infrastructure/` — local storage, background jobs, and child-process execution
- `shared/` — filesystem paths and cross-feature utilities

The thumbnail renderer creates a 1280×720 `.thumbnail.jpg` (uses the
  `## Thumbnail Hook` line from metadata; supports 1–2 lines)
and audio remains per-line OpenAI TTS. See `docs/architecture.md` for dependency rules.

## 5. Web layer (`app/`)
- `app/page.tsx` — the **entire client UI** (`'use client'`): stepped flow (Topic → Script
  → Metadata → YouTube video[thumbnail/audio/video sub-steps + config panel] → Reels),
  "Generate all" with a **non-stop** toggle, job polling, recovers active debate from
  `localStorage`.
- `app/layout.tsx`, `app/globals.css`, `app/icon.svg` (favicon).
- API routes (`route.ts` = server endpoint; `[name]`/`[id]` = URL vars; all
  `runtime='nodejs'`):
  - `POST /api/debate` (script) · `GET /api/debate/[name]` (full state from disk)
  - `[name]/script` PUT · `[name]/metadata` POST+PUT · `[name]/config` PUT
  - `[name]/thumbnail` POST(gen)+GET(serve jpg) · `[name]/audio` POST(job)
  - `[name]/video` POST(job)+GET(serve mp4, `?reel=<n>`) · `[name]/extract-reels` POST
  - `[name]/reels-scripts` GET+PUT · `[name]/reels` POST(job)
  - `/api/job/[id]` (poll) · `/api/job/active` (is any render running)
  - `/api/options` (dropdowns from config.ts) · `/api/voice-sample/[voice]` (cached preview)
- `src/infrastructure/process/runStage.ts` — spawn quick stage, await, parse markers
- `src/infrastructure/jobs/jobManager.ts` — in-memory job registry on `globalThis`,
  `activeJob` (self-heals a dead render via `process.kill(pid,0)` so it can't wedge the
  single slot). **One render at a time.**
- `src/features/rendering/videoFiles.ts` locates finished output; `src/shared/voices.ts`
  owns the valid TTS voices and sample text.

## 6. Config (`config.ts`)
- `baseConfig` (defaults) + `VIDEO_STYLES` (`style1` default landscape, `style2` host-bg,
  `style3` = reels 9:16) + `STYLES` (named subtitle presets).
- `configureRun(overrides)` — applies per-run web choices (voices, TTS model/speed,
  subtitle style, video style, custom subtitle) onto the `config` singleton. The `video`
  and reels stages read a per-debate config from the project sidecar and call this.

## 7. Disk layout
- `output/debates/<name>.project.json` is authoritative; `<name>.txt` is a compatibility export
- `output/debates/reels/<name>_partK.txt` (reel scripts), `<name>.parts.json` (reel sidecar)
- `output/audios/<name>/…mp3`, `output/audios/reels/<name>_partK/…mp3`
- `output/publish/<name>/` — **deliverables**: `.metadata.md`, `.thumbnail.jpg`, main
  `<name>_<ts>.mp4`, reels `<name>_partK_<ts>.mp4`
- `output/cost_log.jsonl` (global), `output/voice-samples/<voice>.mp3` (cache)
- Debate names are `debate<N>`, auto-numbered.

## 8. Gotchas (these will bite you)
- **`assets/` and `.env` are gitignored** — fonts/speaker-images are NOT in git. Any deploy
  or clone must supply them.
- **One render at a time** globally (in-memory registry). Starting a second returns 409;
  UI shows a "render in progress elsewhere" banner (`/api/job/active`).
- **Jobs are in-memory** — lost on server restart (fine for local; a SaaS needs a DB/queue).
- Reels reuse the source scenes and audio; preserve their scene order when editing.
- **ffmpeg fps bug (fixed, don't reintroduce):** xfade fails → 0-byte video if clip
  durations average to a non-integer fps. Fix in `buildVideo.ts`:
  `[i:v]fps=${config.fps},settb=AVTB`. This is why reels were coming out 0-byte.
- **Editing a reel part's text is fine; don't add/remove lines** — reel audio is reused by
  original line index (`.parts.json`).
- OpenAI occasionally 500s → `withRetry` wraps structured generation and audio has its own retry.

## 9. Current state (done)
Full working web app: stepped generation, per-step edit + regenerate, config panel
(per-speaker voices, TTS model/speed, subtitle style, video style, **custom subtitle**
position/font/size/color), voice previews, "Generate all" + **non-stop** mode, 2-line
thumbnail hooks, favicon, wider layout. Recent fixes: transient-500 retries, 0-byte-reel
fps fix (verified: debate37 reels rebuilt non-zero), thumbnail overflow auto-fit.
**Not yet done:** a fresh full non-stop run to confirm 3 playable reels end-to-end (was
about to run when handed over — worth doing first).

## 10. Open directions (NOT decided — discuss with the owner)
The owner's near-term goal is **portfolio/interviews** (there's a LinkedIn post drafted).
Product direction is undecided; options explored:
- **SaaS phase 1** (plan at `~/.claude/plans/i-want-to-convert-scalable-dewdrop.md`):
  containerize + shared-code gate + persistent volume, host on Fly.io/Hetzner (cheap). No
  auth/multi-tenant yet.
- **Desktop app (Electron) + BYOK** — reuses the spawn architecture; zero server cost; needs
  output-path + ffmpeg-path parameterization, bundle ffmpeg, tsc→node (drop tsx), key UI.
- **New "infographic" video type** — topic → narration + per-beat visual queries → source
  images (Pexels/Pixabay/Wikimedia/DALL·E) → Ken Burns (`zoompan`) slideshow. This is where
  RAG/retrieval becomes *genuinely* justified. Reuses ~60% of the pipeline.
- Deferred: auth, DB-backed durable jobs + queue, object storage/CDN, usage metering/billing,
  eval harness, tests (there are none).

## 11. How to verify a change
1. `npx tsc --noEmit` (must be clean).
2. `npm run next:dev`, open localhost:3000, run a cheap debate (topic + Generate all →
   non-stop) → confirm main video + 3 non-zero reels in `output/publish/<name>/` and they
   play in the browser.
3. Confirm the CLI still works: `npm start "<topic>"`.
