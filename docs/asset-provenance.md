# Bundled asset provenance

This file records how repository-owned media was created for redistribution with KZR Video Generator.

## Original character and interface illustrations

The project owner confirmed on 2026-10-26 that the original images listed below were generated with AI for this project and may be redistributed with it:

- `assets/images/image_H.png`
- `assets/images/image_A.png`
- `assets/images/image_B.png`
- `assets/images/image_H_style2.png`
- `assets/images/image_H_style3.png`
- `assets/images/reels/image_H.png`
- `assets/images/reels/image_A.png`
- `assets/images/reels/image_B.png`
- `public/creation/*.jpg`

These are the primary images used by the bundled interface and video-style presets.

The images are distributed under the repository's MIT License.

## Transition sound

`assets/audios/transition_audio.wav` was synthesized locally from filtered pink noise with FFmpeg. It contains no sampled recording. The generation filter uses high-pass and low-pass filtering, short fade-in and fade-out envelopes, and reduced volume.

## Transition videos

The six files under `assets/videos/transition_*.mp4` were generated locally by `src/features/rendering/createTransitions.ts` from the three bundled illustrations, then combined with the synthesized transition sound through `src/features/rendering/addTransitionAudio.ts`.

## Interface preview

`docs/images/kzr-creator-studio.svg` is a code-authored vector preview based on the production-rendered project-library screen. It uses no third-party image assets.
