/**
 * OpenAI TTS voices usable with tts-1 / tts-1-hd (verified against the API — 'ballad' and
 * 'verse' are rejected by these models, so they're excluded). Single source of truth,
 * imported by the options, config-validation, and voice-sample routes.
 */
export const VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'] as const;

export function isValidVoice(v: string): boolean {
  return (VOICES as readonly string[]).includes(v);
}

/** Short line spoken in each voice preview. */
export const SAMPLE_TEXT = 'Hi, this is a quick preview of how this voice sounds in your debate video.';
