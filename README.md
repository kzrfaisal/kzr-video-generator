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