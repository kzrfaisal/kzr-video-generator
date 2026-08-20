import fs from 'fs';
import path from 'path';
import { isValidDebateName } from '@/src/infrastructure/process/runStage';
import { readVisualPlan } from '@/src/features/visuals/visualScenes';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string; scene: string }> }) {
  const { name, scene } = await params;
  if (!isValidDebateName(name) || !/^(?:visual-)?scene-\d{2,}$/.test(scene)) return new Response('Invalid scene.', { status: 400 });
  const item = readVisualPlan(name)?.scenes.find(candidate => candidate.id === scene);
  if (!item?.imagePath || !fs.existsSync(item.imagePath)) return new Response('Image not found.', { status: 404 });
  const file = path.resolve(item.imagePath);
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' },
  });
}
