import type { ContentMode, ScriptScene, SpeakerRole } from './types';

export interface DialogueLine {
  speaker: SpeakerRole;
  text: string;
}

function sanitizeNarration(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .trim();
}

function parseSpeaker(value: string): SpeakerRole | null {
  return value === 'HOST' || value === 'A' || value === 'B' ? value : null;
}

export function parseLegacyScript(text: string, contentMode: ContentMode): DialogueLine[] {
  const rawLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (rawLines.length === 0) throw new Error('Script cannot be empty.');

  return rawLines.map((line, index) => {
    const separator = line.indexOf('|');
    const speaker = separator > 0 ? parseSpeaker(line.slice(0, separator)) : null;
    const narration = separator > 0 ? sanitizeNarration(line.slice(separator + 1)) : '';
    if (!speaker || !narration) {
      throw new Error(`Invalid script line ${index + 1}. Expected SPEAKER|narration.`);
    }
    if (contentMode === 'narrated-explainer' && speaker !== 'HOST') {
      throw new Error(`Invalid explainer line ${index + 1}. Explainers must use HOST narration.`);
    }
    return { speaker, text: narration };
  });
}

export function scriptToLegacyText(scenes: ScriptScene[]): string {
  return scenes.map(scene => `${scene.speaker}|${scene.narration}`).join('\n') + (scenes.length ? '\n' : '');
}

function fingerprint(line: DialogueLine): string {
  return `${line.speaker}\u0000${line.text}`;
}

function nextSceneNumber(scenes: ScriptScene[]): number {
  return scenes.reduce((highest, scene) => {
    const match = scene.id.match(/^scene-(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
}

function newScene(id: string, line: DialogueLine, contentMode: ContentMode): ScriptScene {
  return {
    id,
    speaker: line.speaker,
    narration: line.text,
    headline: '',
    visualQuery: '',
    visualType: contentMode === 'narrated-explainer' ? 'stock-photo' : 'character',
    visualAssetPath: null,
    durationHintSeconds: null,
    overlays: [],
    status: 'draft',
  };
}

/**
 * Convert the legacy textarea format into scenes while preserving IDs across normal edits.
 * Exact matches are retained first, then same-position edits reuse their existing ID.
 */
export function reconcileScenes(
  text: string,
  contentMode: ContentMode,
  previous: ScriptScene[] = [],
): ScriptScene[] {
  const lines = parseLegacyScript(text, contentMode);
  const used = new Set<string>();
  const exact = new Map<string, ScriptScene[]>();
  for (const scene of previous) {
    const key = fingerprint({ speaker: scene.speaker, text: scene.narration });
    exact.set(key, [...(exact.get(key) ?? []), scene]);
  }

  // Reserve exact matches before positional matching. This prevents a newly inserted
  // line from taking the ID of an unchanged scene that moved further down the script.
  const reserved = new Set<string>();
  const exactAssignments = lines.map(line => {
    const match = exact.get(fingerprint(line))?.find(scene => !reserved.has(scene.id));
    if (match) reserved.add(match.id);
    return match;
  });

  let nextNumber = nextSceneNumber(previous);
  let passedExactAnchor = false;
  return lines.map((line, index) => {
    const exactMatch = exactAssignments[index];
    const positional = previous[index];
    const positionalMatch = positional && !used.has(positional.id) && !reserved.has(positional.id)
      ? positional
      : undefined;
    const shiftedEdit = passedExactAnchor
      ? previous.find(scene => !used.has(scene.id) && !reserved.has(scene.id) && scene.speaker === line.speaker)
      : undefined;
    const prior = exactMatch ?? positionalMatch ?? shiftedEdit;
    if (prior) {
      used.add(prior.id);
      if (exactMatch) passedExactAnchor = true;
      return { ...prior, speaker: line.speaker, narration: line.text };
    }
    const id = `scene-${String(nextNumber++).padStart(3, '0')}`;
    used.add(id);
    return newScene(id, line, contentMode);
  });
}

export function scenesToDialogue(scenes: ScriptScene[]): DialogueLine[] {
  return scenes.map(scene => ({ speaker: scene.speaker, text: sanitizeNarration(scene.narration) }));
}
