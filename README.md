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
# Generate script + pause for review + generate video
npm start "AI replacing teachers"
```

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

# Run stages separately:
tsx src/createVideoSegments.ts debate1
tsx src/buildVideo.ts debate1
```

---

## Transition Videos

Run these when you replace speaker images (`assets/images/image_H.png`, `image_A.png`, `image_B.png`).

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
tsx src/addTransitionAudio.ts transition_H_to_A
```

---

## Output

- Scripts: `output/debates/debateN.txt`
- Final videos: `output/videos/debateN_TIMESTAMP.mp4`
- Temp files (auto-deleted): `tmp/`

---

## Speakers & Voices

| Speaker | Voice | Role |
|---|---|---|
| HOST | alloy | Neutral narrator |
| A | echo | Speaker A (male) |
| B | onyx | Speaker B (male, deep) |

---

## Assets

| Path | Description |
|---|---|
| `assets/images/image_H.png` | HOST portrait |
| `assets/images/image_A.png` | Speaker A portrait |
| `assets/images/image_B.png` | Speaker B portrait |
| `assets/videos/transition_*.mp4` | 6 transition clips (H↔A, H↔B, A↔B) |
| `assets/fonts/Nunito-Regular.ttf` | Subtitle font |
| `assets/audios/transition_audio.wav` | Audio for transition clips |



-------------------
# kzr-video-generator

# Regenerate all 6 transition videos
npm run transitions

# Or just one pair (e.g. B → H)
tsx src/createTransitions.ts B H

# Add audio to all transitions
npm run transition-audio

# Or just one
tsx src/addTransitionAudio.ts transition_B_to_H
Note: make sure assets/audios/transition_audio.wav exists before running addTransitionAudio. The script writes to a .tmp.mp4 first, then renames — so it safely overwrites the original without ffmpeg seeing the same input/output file.