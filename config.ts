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
    fontsize: 50, fontcolor: 'white',
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
    wrapWidth: 28, lineHeight: 72,
  },
};

export interface ThumbnailFont {
  /** Path to the .ttf font used for both thumbnail text elements. */
  font: string;
  /** Top-left "DEBATE" label styling. `x`/`y` accept raw pixels (`'80'`) or ffmpeg drawtext expressions (`'(w-text_w)/2'`, `'h-text_h-40'`). */
  label: { size: number; color: string; x: string; y: string };
  /** Center hook text styling (line read from `## Thumbnail Hook` in metadata). `x`/`y` accept raw pixels or ffmpeg drawtext expressions. */
  hook: { size: number; color: string; x: string; y: string };
}

/** Styling for the persistent "Part N - <title>" banner shown vertically centered on reel videos. Mirrors the thumbnail hook look (font + fill + soft glow). */
export interface BannerFont {
  /** Path to the .ttf font. ffmpeg has no bold flag — pick a bold/heavy face (e.g. Anton, Bebas Neue, UbuntuMono-Bold) to make it bold. */
  font: string;
  /** Font size in pixels. */
  size: number;
  /** Fill color: named (`white`), hex (`0xFFFFFF`), or `name@alpha`. */
  color: string;
  /** Max characters per line before wrapping. */
  wrapWidth: number;
  /** Vertical pixel gap between wrapped banner lines. */
  lineHeight: number;
  /** Soft glow halo behind the fill — same technique as the thumbnail hook (stacked drawtext passes). Omit for no glow. `passes` = list of `{ w: border width px, a: alpha 0-1 }`, widest/faintest first. */
  glow?: { color: string; passes: { w: number; a: number }[] };
}

export interface Config {
  /** Auto-generate prerendered transition video clips before building the final video */
  createTransitionVideos: boolean;
  /** Insert prerendered transition video clips between speaker switches in the final video */
  includeTransitionVideos: boolean;
  /** Style applied between consecutive segments at concat time.
   *  'none'     = hard cut (current behavior);
   *  'fade'     = ffmpeg xfade crossfade between every adjacent pair (drifts on long videos due to AAC quantization);
   *  'fade-pcm' = same as 'fade' but segments use PCM audio in .mkv so durations are sample-accurate and the chain does not drift.
   */
  transitionStyle: 'none' | 'fade' | 'fade-pcm';

  /** Active video-style preset key into VIDEO_STYLES (e.g. 'style1', 'style2', 'style3') */
  videoStyle: string;
  /** Visual treatment for each scene: character debate backgrounds or generated infographic cards. */
  visualMode: 'debate' | 'infographic';
  /** Editorial structure: a two-sided discussion or a single-narrator explainer. */
  contentMode: 'debate' | 'narrated-explainer';
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
  /** When true, the script stage also produces a debateN.metadata.md file with YouTube title/description/hashtags and the 3 reel captions. When false, only the script .txt is written and no extra OpenAI call is made. */
  generateMetadata: boolean;
  /** When true, the script stage also renders a 1280×720 debateN.thumbnail.jpg using config.thumbnailBackground + the `## Thumbnail Hook` line from the metadata file. Requires generateMetadata: true. */
  generateThumbnail: boolean;
  /** Background image used for the generated YouTube thumbnail. */
  thumbnailBackground: string;
  /** Font + per-element size/color for the thumbnail text. Separate from `font` so the subtitle font is unaffected when iterating on thumbnail styling. */
  thumbnailFont: ThumbnailFont;
  /** Styling for the persistent "Part N - <title>" reel banner. Separate from `font` so it can look distinct from the subtitles. */
  bannerFont: BannerFont;

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
  transitionStyle: 'fade-pcm',

  videoStyle: 'style1',
  visualMode: 'debate',
  contentMode: 'debate',
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
  subtitleWrapWidth: 78,

  ttsModel: 'tts-1',
  ttsSpeed: 1.0,
  voices: { HOST: 'alloy', A: 'echo', B: 'ash' },

  scriptModel: 'gpt-4o-mini',
  videoLengthTarget: '5-7 minutes',
  promptFile: 'source/debate_prompt.txt',
  generateMetadata: true,
  generateThumbnail: true,
  thumbnailBackground: 'assets/images/image_H.png',
  thumbnailFont: {
    // font: 'assets/fonts/Anton-Regular.ttf',
    // label: { size: 45, color: '0xD3D3D3', x: '80',          y: '60' },
    // hook:  { size: 65, color: '0x7ff217', x: '(w-text_w)/2', y: '(h-text_h)/2-80' },
    font: 'assets/fonts/Unbounded-VariableFont_wght.ttf',
    label: { size: 40, color: '0xD3D3D3', x: '80',          y: '60' },
    hook:  { size: 65, color: '0xFFFFFF', x: '(w-text_w)/2', y: '(h-text_h)/2-80' },
  },
  bannerFont: {
    font: 'assets/fonts/Unbounded-VariableFont_wght.ttf',
    size: 52,
    color: '0xFFFFFF',
    wrapWidth: 24,
    lineHeight: 64,
    glow: { color: '0xFFFFFF', passes: [{ w: 8, a: 0.10 }, { w: 4, a: 0.20 }] },
  },

  isReelStyle: false,
  videoCrf: 18,
  videoPreset: 'slow',
  fps: 30,
  audioPadding: 0.1,
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
 * Read `--style=<name>` (or `--style <name>`) so any CLI entry point can override
 * `baseConfig.videoStyle` without editing this file. Both work:
 *   npm start "topic" --style=style2          (npm consumes the flag → env var)
 *   tsx src/makeVideo.ts deb10 --style=style3 (direct invocation → argv)
 *   npm run reels deb10 -- --style=style3     (npm with `--` passthrough → argv)
 */
function parseStyleFlag(): string | undefined {
  // npm strips long flags from `npm run <script>` and exposes them as
  // npm_config_<name>. Check this first so the bare `npm run ... --style=X`
  // form works without the `--` separator.
  if (process.env.npm_config_style) return process.env.npm_config_style;

  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--style' && args[i + 1]) return args[i + 1];
    const m = args[i].match(/^--style=(.+)$/);
    if (m) return m[1];
  }
  return undefined;
}

const activeStyle = parseStyleFlag() ?? baseConfig.videoStyle;
if (!(activeStyle in VIDEO_STYLES)) {
  throw new Error(
    `Unknown video style: "${activeStyle}". Available: ${Object.keys(VIDEO_STYLES).join(', ')}`
  );
}

/**
 * Active config. baseConfig values are overridden by the selected style's overrides.
 * Shallow merge: nested objects (images, voices, subtitleStyle) are replaced wholesale.
 */
export const config: Config = {
  ...baseConfig,
  ...VIDEO_STYLES[activeStyle],
  videoStyle: activeStyle,
};

/** Per-run overrides the web UI can choose without editing this file. */
export interface RunOverrides {
  videoStyle?: string;                 // a VIDEO_STYLES key (e.g. style1 / style2)
  visualMode?: 'debate' | 'infographic';
  contentMode?: 'debate' | 'narrated-explainer';
  voices?: Partial<Config['voices']>;  // per-speaker OpenAI voice
  ttsModel?: string;                   // 'tts-1' | 'tts-1-hd'
  ttsSpeed?: number;                   // 0.25–4.0
  subtitleStyle?: string;              // one STYLES key, applied to all speakers
  customSubtitle?: Partial<SubtitleStyle>; // custom fields layered over the chosen style
}

/**
 * Apply per-run overrides onto the exported `config` singleton. Recomputes from
 * baseConfig + the chosen video-style preset, then layers the individual overrides.
 * Safe because a stage process runs one config at a time. Throws on unknown keys.
 */
export function configureRun(o: RunOverrides): void {
  const style = o.videoStyle ?? config.videoStyle;
  if (!(style in VIDEO_STYLES)) {
    throw new Error(`Unknown video style: "${style}". Available: ${Object.keys(VIDEO_STYLES).join(', ')}`);
  }
  const merged: Config = { ...baseConfig, ...VIDEO_STYLES[style], videoStyle: style };

  if (o.visualMode) merged.visualMode = o.visualMode;
  if (o.contentMode) merged.contentMode = o.contentMode;

  if (o.voices) {
    merged.voices = { ...merged.voices };
    for (const [speaker, voice] of Object.entries(o.voices)) {
      if (voice) merged.voices[speaker] = voice;
    }
  }
  if (o.ttsModel) merged.ttsModel = o.ttsModel as Config['ttsModel'];
  if (typeof o.ttsSpeed === 'number') merged.ttsSpeed = o.ttsSpeed;
  if (o.customSubtitle && Object.keys(o.customSubtitle).length > 0) {
    // Register a runtime style entry combining the chosen base style + the custom fields,
    // then point every speaker at it. createVideoSegments reads STYLES[key] at call time.
    const baseKey = o.subtitleStyle && o.subtitleStyle in STYLES ? o.subtitleStyle : 'top-classic';
    STYLES['__custom__'] = { ...STYLES[baseKey], ...o.customSubtitle };
    merged.subtitleStyle = { HOST: '__custom__', A: '__custom__', B: '__custom__' };
  } else if (o.subtitleStyle) {
    if (!(o.subtitleStyle in STYLES)) {
      throw new Error(`Unknown subtitle style: "${o.subtitleStyle}".`);
    }
    merged.subtitleStyle = { HOST: o.subtitleStyle, A: o.subtitleStyle, B: o.subtitleStyle };
  }

  Object.assign(config, merged);
}
