import { NextResponse } from 'next/server';
import fs from 'fs';
import { runStage } from '@/lib/stage';
import { scriptPath } from '@/src/paths';

export const runtime = 'nodejs';

// POST /api/debate — generate a new debate script from a topic + context.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const context = typeof body.context === 'string' ? body.context.trim() : '';
  if (!topic) {
    return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
  }

  const args = ['script', topic];
  if (context) args.push(`--context=${context}`);
  const result = await runStage(args);

  const debateName = result.markers.DEBATE;
  if (!result.ok || !debateName) {
    return NextResponse.json(
      { error: 'Script generation failed.', detail: result.output.slice(-600) },
      { status: 500 },
    );
  }

  const script = fs.readFileSync(scriptPath(debateName), 'utf-8');
  return NextResponse.json({ debateName, topic, context, script });
}
