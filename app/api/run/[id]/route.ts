import { NextResponse } from 'next/server';
import { runs, publicView } from '@/lib/runs';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = runs.get(id);
  if (!state) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }
  return NextResponse.json(publicView(state));
}
