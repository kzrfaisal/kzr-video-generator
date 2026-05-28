# kzr-video-generator

TypeScript/Node.js CLI that generates debate videos from a text topic.

**Stack:** Node.js, TypeScript (tsx), OpenAI GPT-4o-mini (script), OpenAI TTS tts-1 (audio), ffmpeg (video)

---

## Setup

```bash
npm install
```

Create a `.env` file with your OpenAI API key:
```
OPENAI_API_KEY=sk-...
```

---

## Full Pipeline

```bash
# Generate script + pause for review + generate audio + generate video
npm start "AI replacing teachers"
```

When the run completes, a **Run Report** prints with token counts, character counts, USD/INR cost, and per-stage timing. The same data is appended to `output/cost_log.jsonl`.

---

## Configuration

All user-tunable settings live in [`config.ts`](config.ts). The file has three parts:

1. **`baseConfig`** — defaults used by every video.
2. **`VIDEO_STYLES`** — a map of preset name → `Partial<Config>`. Each preset declares only the fields that differ from the defaults.
3. **`config`** (exported) — the active config, computed as `{ ...baseConfig, ...VIDEO_STYLES[baseConfig.videoStyle] }`.

The merge is **shallow** — nested maps (`images`, `voices`, `subtitleStyle`) are replaced as a whole. If a preset wants to change one entry in a map, it must spell out the full map.

### Feature flags

| Field | Values | Notes |
|---|---|---|
| `createTransitionVideos` | `true` / `false` | Auto-generate prerendered transition video clips during `npm start`. Only runs when `includeTransitionVideos` is also `true`. |
| `includeTransitionVideos` | `true` / `false` | Insert prerendered transition video clips between speaker switches in the final video. |
| `transitionStyle` | `'none'` / `'fade'` | Style applied between consecutive segments at concat time. `'none'` = hard cut (default). `'fade'` = ffmpeg `xfade` crossfade between every adjacent pair (uses `transitionDuration` for the crossfade length). Orthogonal to `includeTransitionVideos`. |
| `videoStyle` | `'style1'` / `'style2'` / `'style3'` | Active preset key in `VIDEO_STYLES`. See [Video Styles](#video-styles) below. |
| `isReelStyle` | `true` / `false` | When `true`, video segments and transitions render at 1080×1920 (9:16). Set automatically by the `style3` preset. |

### Images

| Field | Description |
|---|---|
| `images` | `{ HOST, A, B }` map of speaker → image path. Each preset can override this whole map. |

### Audio / TTS

| Field | Default | Notes |
|---|---|---|
| `ttsModel` | `'tts-1'` | OpenAI TTS model. Use `'tts-1-hd'` for higher quality (more expensive). |
| `ttsSpeed` | `1.0` | Speech rate, 0.25–4.0. |
| `voices` | `{ HOST: 'alloy', A: 'echo', B: 'onyx' }` | Per-speaker OpenAI voice. |

### Script generation

| Field | Default | Notes |
|---|---|---|
| `scriptModel` | `'gpt-4o-mini'` | OpenAI model used to generate the debate. |
| `videoLengthTarget` | `'5-7 minutes'` | Substituted into the prompt template as the `{videoLength}` placeholder. |
| `promptFile` | `'source/debate_prompt.txt'` | Path to the prompt template. `style3` swaps this to `source/reels_prompt.txt`. |

### Subtitles

| Field | Default | Notes |
|---|---|---|
| `subtitleStyle` | `{ HOST, A, B }` | Per-speaker map → key from the `STYLES` map in `config.ts`. Default has every speaker on `top-classic`. |
| `font` | `'assets/fonts/Segoe UI Italic.ttf'` | Default font; can be overridden per style. |
| `subtitleLineHeight` | `50` | Default gap (px) between stacked subtitle lines. |
| `subtitleWrapWidth` | `72` | Default max characters per line before wrapping. |

### Video encoding

| Field | Default | Notes |
|---|---|---|
| `videoCrf` | `18` | libx264 quality. 0–51, lower = better. |
| `videoPreset` | `'slow'` | libx264 preset. `ultrafast` → `veryslow`. |
| `fps` | `30` | Output frame rate. |
| `audioPadding` | `0.4` | Silence (seconds) appended to each spoken clip. |
| `fadeInDuration` | `0.12` | Fade-in length at start of final video. |

### Transitions

| Field | Default | Notes |
|---|---|---|
| `transitionEffect` | `'fade'` | ffmpeg `xfade` effect name (e.g. `fade`, `wipeleft`, `slideleft`). |
| `transitionDuration` | `1` | Animation length in seconds. |

---

## Video Styles

Presets live in the `VIDEO_STYLES` map in [`config.ts`](config.ts). Switch the active preset via `baseConfig.videoStyle`. Each preset is a `Partial<Config>` — list only what differs from the defaults.

| Preset | Purpose | Key overrides |
|---|---|---|
| `style1` | Default 16:9 debate | (none — pure defaults) |
| `style2` | Same 16:9, abstract host background + big-center subtitle for HOST only | `images.HOST`, `subtitleStyle.HOST` |
| `style3` | 9:16 Reels/Shorts, 30–60s, portrait images, big-center subtitles | `isReelStyle`, `videoLengthTarget`, `promptFile`, `transitionDuration`, `subtitleStyle`, `images` |

### Adding a new style

```ts
// in config.ts VIDEO_STYLES map
'my-style': {
  // Only list what differs from baseConfig.
  // Nested maps are replaced as a whole, so spell them out fully if you touch them.
  subtitleStyle: { HOST: 'card', A: 'card', B: 'card' },
  videoLengthTarget: '3-4 minutes',
},
```

Then set `videoStyle: 'my-style'` in `baseConfig`.

---

## Subtitle Styles

Styles are defined in the `STYLES` map in `config.ts`. The active preset picks which style applies per speaker via the `subtitleStyle` map. Built-ins:

| Style | Look |
|---|---|
| `youtube-classic` | White text, thick black outline |
| `card` | White text on a semi-transparent dark box |
| `bold-yellow` | Yellow text with heavy black border |
| `glow` | White text with a strong drop shadow |
| `lower-third` | White text on a full-width navy bar |
| `top-classic` | White text with a small shadow (default) |
| `big-center` | Very large, vertically-centered (used automatically for HOST in `style2`) |
| `reels-top` | Mobile-friendly: medium size, upper-third placement, narrow wrap so 4–5 lines fit (used by `style3`) |

### Per-style overrides

Each entry in `STYLES` can override the global config for that style only:

| Field | Overrides | Example |
|---|---|---|
| `font` | `config.font` | Use a non-italic font for one style |
| `wrapWidth` | `config.subtitleWrapWidth` | Wrap sooner for a larger font |
| `lineHeight` | `config.subtitleLineHeight` | More breathing room between lines |

### Adding a new style

```ts
// in config.ts STYLES map
'my-style': {
  fontsize: 50,
  fontcolor: 'white',
  bordercolor: 'black', borderw: 3,
  position: 'top',        // 'top' | 'bottom' | 'center'
  margin: 100,
  // optional overrides:
  font: 'assets/fonts/Nunito-Regular.ttf',
  wrapWidth: 40,
  lineHeight: 60,
},
```

Then set `subtitleStyle: 'my-style'`.

---

## Run Individual Stages

```bash
# 1. Generate debate script only (saves to output/debates/debateN.txt)
npm run script "AI replacing teachers"
# or
tsx src/generateScript.ts "AI replacing teachers"

# 2. Generate audio for a debate (reads output/debates/debate1.txt)
npm run audio debate1
# or
tsx src/generateAudio.ts debate1

# 3. Generate video segments + build final video
npm run video debate1
# or
tsx src/makeVideo.ts debate1

# Run video stages separately:
tsx src/createVideoSegments.ts debate1
tsx src/buildVideo.ts debate1
```

---

## Transition Videos

Run these when you replace speaker images (`assets/images/image_H.png`, `image_A.png`, `image_B.png`) or change `config.transitionEffect` / `config.transitionDuration`.

```bash
# Regenerate all 6 transition videos
npm run transitions
# or
tsx src/createTransitions.ts

# Regenerate one specific transition (FROM and TO are H, A, or B)
tsx src/createTransitions.ts B H
tsx src/createTransitions.ts H A

# Add audio to all transition videos
# Requires: assets/audios/transition_audio.wav
npm run transition-audio
# or
tsx src/addTransitionAudio.ts

# Add audio to one specific transition
tsx src/addTransitionAudio.ts transition_B_to_H
```

> Note: `addTransitionAudio` writes to a `.tmp.mp4` first, then renames over the original — so ffmpeg never reads and writes the same file simultaneously.

When `config.createTransitionVideos === true` and `config.includeTransitionVideos === true`, `npm start` runs both transition generation and audio attach automatically as part of the pipeline.

---

## Output

- Scripts: `output/debates/debateN.txt`
- Audio: `output/audios/debateN/`
- Final videos: `output/videos/debateN_TIMESTAMP.mp4`
- Cost / timing log (JSONL, one run per line): `output/cost_log.jsonl`
- Temp files (auto-deleted): `tmp/`

---

## Assets

| Path | Description |
|---|---|
| `assets/images/image_H.png` | HOST portrait (used by `style1`) |
| `assets/images/image_A.png` | Speaker A portrait (`style1` and `style2`) |
| `assets/images/image_B.png` | Speaker B portrait (`style1` and `style2`) |
| `assets/images/image_H_style2.png` | Abstract HOST background (used by `style2`) |
| `assets/images/reels/image_H.png` | Portrait HOST image for `style3` (9:16) |
| `assets/images/reels/image_A.png` | Portrait Speaker A image for `style3` |
| `assets/images/reels/image_B.png` | Portrait Speaker B image for `style3` |
| `assets/videos/transition_*.mp4` | 6 transition clips (H↔A, H↔B, A↔B) |
| `assets/fonts/*.ttf` | Subtitle fonts (referenced from `config.font` or per-style `font`) |
| `assets/audios/transition_audio.wav` | Audio attached to transition clips |

> Tip: For 16:9 styles keep speaker images close to ~1380×752 (matching dimensions across all three). For `style3` use portrait 1080×1920 images. Oversize images (e.g. 5000×3000) drastically slow ffmpeg encoding.

> Note: Regenerate transitions (`npm run transitions`) after switching `videoStyle` between 16:9 and `style3`, since the active `videoStyle`'s `images` map and aspect ratio are baked into the transition clips.
