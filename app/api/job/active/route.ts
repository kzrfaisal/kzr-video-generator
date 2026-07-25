import { NextResponse } from 'next/server';
import { activeJob } from '@/lib/jobs';

export const runtime = 'nodejs';

// GET /api/job/active — is any render running right now, and on which debate?
// (Static segment "active" is matched before the dynamic [id] route.)
export async function GET() {
  const j = activeJob();
  return NextResponse.json(
    j ? { active: true, debateName: j.debateName, kind: j.kind, stage: j.stage } : { active: false },
  );
}
