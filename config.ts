export interface SubtitleStyle {
  fontsize: number;
  fontcolor: string;
  bordercolor?: string;
  borderw?: number;
  shadowcolor?: string;
  shadowx?: number;
  shadowy?: number;
  box?: number;
  boxcolor?: string;
  boxborderw?: number;
  position: 'top' | 'bottom';
  margin: number;
  lowerThirdBar?: { color: string; padding: number };
}

export const STYLES: Record<string, SubtitleStyle> = {
  // White text with thick black outline — most common YouTube style
  'youtube-classic': {
    fontsize: 44, fontcolor: 'white',
    bordercolor: 'black', borderw: 3,
    position: 'top', margin: 120,
  },
  // White text on a semi-transparent dark box
  'card': {
    fontsize: 40, fontcolor: 'white',
    box: 1, boxcolor: 'black@0.55', boxborderw: 12,
    position: 'top', margin: 120,
  },
  // Yellow text with heavy black border — sports/reaction style
  'bold-yellow': {
    fontsize: 46, fontcolor: 'yellow',
    bordercolor: 'black', borderw: 4,
    position: 'top', margin: 120,
  },
  // White text with strong shadow — cinematic/podcast look
  'glow': {
    fontsize: 40, fontcolor: 'white',
    shadowcolor: 'black@0.9', shadowx: 4, shadowy: 4,
    position: 'top', margin: 120,
  },
  // White text on a dark navy bar across full width — news/documentary
  'lower-third': {
    fontsize: 38, fontcolor: 'white',
    position: 'top', margin: 120,
    lowerThirdBar: { color: '0x1a1a2e@0.85', padding: 15 },
  },
  // Original top-center style (legacy)
  'top-classic': {
    fontsize: 40, fontcolor: 'white',
    shadowcolor: 'black', shadowx: 2, shadowy: 2,
    position: 'top', margin: 120,
  },
};

export interface Config {
  /** Set to true to insert transition videos between speaker switches */
  includeTransitions: boolean;

  /** Which subtitle style to use; must be a key of STYLES in this file */
  subtitleStyle: keyof typeof STYLES;
  /** Path to the .ttf font file used for subtitle text */
  font: string;
  /** Vertical pixel gap between subtitle lines */
  subtitleLineHeight: number;
  /** Maximum characters per subtitle line before wrapping */
  subtitleWrapWidth: number;

  /** OpenAI TTS model: 'tts-1' (faster/cheaper) or 'tts-1-hd' (higher quality) */
  ttsModel: string;
  /** Speech speed multiplier: 1.0 is normal, range is 0.25–4.0 */
  ttsSpeed: number;
  /** OpenAI voice assigned to each speaker role */
  voices: Record<string, string>;

  /** OpenAI model used to generate the debate script */
  scriptModel: string;

  /** libx264 CRF quality (0–51): lower = better quality, larger file */
  videoCrf: number;
  /** libx264 encoding preset: slower = smaller file (ultrafast → veryslow) */
  videoPreset: string;
  /** Output frame rate in frames per second */
  fps: number;
  /** Silence (seconds) padded after each audio clip so the image lingers */
  audioPadding: number;
  /** Duration of the fade-in effect at the start of the final video (seconds) */
  fadeInDuration: number;

  /** ffmpeg xfade effect name (e.g. 'fade', 'wipeleft', 'slideleft') */
  transitionEffect: string;
  /** Duration of the transition effect in seconds */
  transitionDuration: number;
}

export const config: Config = {
  /** Set to true to insert transition videos between speaker switches */
  includeTransitions: false,

  /** Which subtitle style to use; must be a key of STYLES in this file */
  subtitleStyle: 'top-classic',
  /** Path to the .ttf font file used for subtitle text */
  font: 'assets/fonts/Segoe UI Italic.ttf',
  /** Vertical pixel gap between subtitle lines */
  subtitleLineHeight: 50,
  /** Maximum characters per subtitle line before wrapping */
  subtitleWrapWidth: 72,

  /** OpenAI TTS model: 'tts-1' (faster/cheaper) or 'tts-1-hd' (higher quality) */
  ttsModel: 'tts-1',
  /** Speech speed multiplier: 1.0 is normal, range is 0.25–4.0 */
  ttsSpeed: 1.0,
  /** OpenAI voice assigned to each speaker role */
  voices: { HOST: 'alloy', A: 'echo', B: 'onyx' },

  /** OpenAI model used to generate the debate script */
  scriptModel: 'gpt-4o-mini',

  /** libx264 CRF quality (0–51): lower = better quality, larger file */
  videoCrf: 18,
  /** libx264 encoding preset: slower = smaller file (ultrafast → veryslow) */
  videoPreset: 'slow',
  /** Output frame rate in frames per second */
  fps: 30,
  /** Silence (seconds) padded after each audio clip so the image lingers */
  audioPadding: 0.4,
  /** Duration of the fade-in effect at the start of the final video (seconds) */
  fadeInDuration: 0.12,

  /** ffmpeg xfade effect name (e.g. 'fade', 'wipeleft', 'slideleft') */
  transitionEffect: 'fade',
  /** Duration of the transition effect in seconds */
  transitionDuration: 1,
};
