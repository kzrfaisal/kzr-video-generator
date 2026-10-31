import { NextResponse } from 'next/server';
import { generateBrief } from '@/src/features/scripts/generateBrief';
import type { ContentMode } from '@/src/domain/projects/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const contentMode: ContentMode = body.contentMode === 'debate' ? 'debate' : 'narrated-explainer';

  try {
    const brief = await generateBrief(contentMode);
    return NextResponse.json({ brief });
  } catch (error) {
    return NextResponse.json({
      error: 'Brief generation failed.',
      detail: error instanceof Error ? error.message : 'OpenAI did not return a usable brief.',
    }, { status: 500 });
  }
}
