import fs from 'fs';
import { projectPath } from './paths';

export type ContentMode = 'debate' | 'narrated-explainer';

export function normalizeContentMode(value: unknown): ContentMode {
  return value === 'narrated-explainer' ? 'narrated-explainer' : 'debate';
}

/** Read the immutable content format chosen when a project was created. */
export function readContentMode(name: string): ContentMode {
  const base = (name.split('/').pop() ?? name).replace(/_part\d+$/, '');
  try {
    const project = JSON.parse(fs.readFileSync(projectPath(base), 'utf-8'));
    return normalizeContentMode(project.config?.contentMode);
  } catch {
    return 'debate';
  }
}
