import { NextResponse } from 'next/server';
import { readUsageEvents, readUsageSummary } from '@/src/services/openai/usageLedger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    usage: readUsageSummary(),
    calls: readUsageEvents(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
