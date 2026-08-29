import { NextResponse } from 'next/server';
import { readUsageSummary } from '@/src/services/openai/usageLedger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(readUsageSummary(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
