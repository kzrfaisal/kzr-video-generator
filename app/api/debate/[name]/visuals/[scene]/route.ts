import { NextResponse } from 'next/server';
import { isValidDebateName } from '@/lib/stage';
import { regenerateVisualScene } from '@/src/visualScenes';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ name: string; scene: string }> }) {
  const { name, scene } = await params;
  if (!isValidDebateName(name) || !/^scene-\d{2,3}$/.test(scene)) {
    return NextResponse.json({ error: 'Invalid visual scene.' }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query : undefined;
  try {
    return NextResponse.json({ scene: await regenerateVisualScene(name, scene, query) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not regenerate scene.' },
      { status: 500 },
    );
  }
}
