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
  position: 'top' | 'bottom' | 'center';
  margin: number;
  lowerThirdBar?: { color: string; padding: number };
  /** Override config.subtitleWrapWidth for this style (chars per line) */
  wrapWidth?: number;
  /** Override config.subtitleLineHeight for this style (pixel gap between lines) */
  lineHeight?: number;
  /** Override config.font for this style (.ttf path) */
  font?: string;
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
  // Large vertically-centered text — for style2 host moments / quote slides
  'big-center': {
    fontsize: 72, fontcolor: 'white',
    bordercolor: 'black', borderw: 5,
    position: 'center', margin: 0,
    wrapWidth: 32, lineHeight: 95,
    // font: 'assets/fonts/Segoe UI.ttf',
  },
  // 9:16 reels/shorts — upper-third placement, mobile-readable size, wraps tight so 4-5 lines fit
  'reels-top': {
    fontsize: 56, fontcolor: 'white',
    bordercolor: 'black', borderw: 4,
    position: 'top', margin: 320,
    wrapWidth: 22, lineHeight: 72,
  },
};

export interface Config {
  /** Auto-generate prerendered transition video clips before building the final video */
  createTransitionVideos: boolean;
  /** Insert prerendered transition video clips between speaker switches in the final video */
  includeTransitionVideos: boolean;
  /** Style applied between consecutive segments at concat time. 'none' = hard cut (current behavior); 'fade' = ffmpeg xfade crossfade between every adjacent pair. */
  transitionStyle: 'none' | 'fade';

  /** Active video-style preset key into VIDEO_STYLES (e.g. 'style1', 'style2', 'style3') */
  videoStyle: string;
  /** Speaker → image path used for that speaker's segments */
  images: Record<string, string>;

  /** Per-speaker subtitle style name (must be a key of STYLES) */
  subtitleStyle: Record<string, keyof typeof STYLES>;
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
  /** Target video length passed to the script prompt (e.g. '5-7 minutes') */
  videoLengthTarget: string;
  /** Path to the script prompt template file */
  promptFile: string;

  /** When true, render at 9:16 reels dimensions (scale-to-fit + black padding). When false, keep the input image's native dimensions. */
  isReelStyle: boolean;
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

/**
 * Default values applied before a style preset is layered on top.
 * To change behavior for a single preset, edit that preset in VIDEO_STYLES.
 * To change behavior everywhere, edit baseConfig.
 */
const baseConfig: Config = {
  createTransitionVideos: false,
  includeTransitionVideos: false,
  transitionStyle: 'none',

  videoStyle: 'style1',
  images: {
    HOST: 'assets/images/image_H.png',
    A: 'assets/images/image_A.png',
    B: 'assets/images/image_B.png',
  },

  subtitleStyle: {
    HOST: 'top-classic',
    A: 'top-classic',
    B: 'top-classic',
  },
  font: 'assets/fonts/Segoe UI Italic.ttf',
  subtitleLineHeight: 50,
  subtitleWrapWidth: 72,

  ttsModel: 'tts-1',
  ttsSpeed: 1.0,
  voices: { HOST: 'alloy', A: 'echo', B: 'onyx' },

  scriptModel: 'gpt-4o-mini',
  videoLengthTarget: '5-7 minutes',
  promptFile: 'source/debate_prompt.txt',

  isReelStyle: false,
  videoCrf: 18,
  videoPreset: 'slow',
  fps: 30,
  audioPadding: 0.4,
  fadeInDuration: 0.12,

  transitionEffect: 'fade',
  transitionDuration: 1,
};

/**
 * Video-style presets. Each entry is a Partial<Config> layered on top of baseConfig.
 * Nested maps (images, voices, subtitleStyle) are replaced as a whole when overridden —
 * spell out every key you want in the preset.
 */
export const VIDEO_STYLES: Record<string, Partial<Config>> = {
  // Default look — pure baseConfig.
  style1: {},

  // Host gets an abstract background + big-center subtitle; A/B unchanged.
  style2: {
    images: {
      HOST: 'assets/images/image_H_style2.png',
      A:    'assets/images/image_A.png',
      B:    'assets/images/image_B.png',
    },
    subtitleStyle: {
      HOST: 'big-center',
      A:    'top-classic',
      B:    'top-classic',
    },
  },

  // 9:16 Reels/Shorts preset. User supplies portrait assets under assets/images/reels/.
  style3: {
    isReelStyle: true,
    videoLengthTarget: '30-60 seconds',
    promptFile: 'source/reels_prompt.txt',
    transitionDuration: 0.4,
    subtitleStyle: {
      HOST: 'reels-top',
      A:    'reels-top',
      B:    'reels-top',
    },
    images: {
      HOST: 'assets/images/reels/image_H.png',
      A:    'assets/images/reels/image_A.png',
      B:    'assets/images/reels/image_B.png',
    },
  },
};

/**
 * Active config. baseConfig values are overridden by the selected style's overrides.
 * Shallow merge: nested objects (images, voices, subtitleStyle) are replaced wholesale.
 */
export const config: Config = {
  ...baseConfig,
  ...VIDEO_STYLES[baseConfig.videoStyle],
};
