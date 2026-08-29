import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const YOUTUBE_REQUIRED = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REFRESH_TOKEN',
];
const INSTAGRAM_REQUIRED = [
  'INSTAGRAM_USER_ID',
  'INSTAGRAM_ACCESS_TOKEN',
];

interface PlatformStatus {
  configured: boolean;
  valid: boolean | null;
  tokenExpiresAt: string | null;
  dataAccessExpiresAt?: string | null;
  message: string;
}

function isoFromUnix(seconds: unknown): string | null {
  return typeof seconds === 'number' && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

function responseError(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const parsed = body as { error?: string | { message?: string }; error_description?: string; message?: string };
  if (typeof parsed.error === 'string') return parsed.error_description || parsed.error;
  return parsed.error?.message || parsed.error_description || parsed.message || fallback;
}

async function youtubeStatus(): Promise<PlatformStatus> {
  const missing = YOUTUBE_REQUIRED.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    return {
      configured: false,
      valid: null,
      tokenExpiresAt: null,
      message: `Missing: ${missing.join(', ')}`,
    };
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!.trim(),
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!.trim(),
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!.trim(),
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        configured: true,
        valid: false,
        tokenExpiresAt: null,
        message: responseError(body, response.statusText),
      };
    }
    return {
      configured: true,
      valid: true,
      tokenExpiresAt: null,
      message: 'Refresh token is valid. Google does not provide it with a fixed expiry date.',
    };
  } catch {
    return {
      configured: true,
      valid: null,
      tokenExpiresAt: null,
      message: 'Could not reach Google to check the token.',
    };
  }
}

async function instagramStatus(): Promise<PlatformStatus> {
  const missing = INSTAGRAM_REQUIRED.filter(name => !process.env[name]?.trim());
  if (missing.length) {
    return {
      configured: false,
      valid: null,
      tokenExpiresAt: null,
      dataAccessExpiresAt: null,
      message: `Missing: ${missing.join(', ')}`,
    };
  }

  try {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN!.trim();
    const version = process.env.META_GRAPH_VERSION?.trim() || 'v24.0';
    const params = new URLSearchParams({ input_token: token, access_token: token });
    const response = await fetch(`https://graph.facebook.com/${version}/debug_token?${params}`, {
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null) as {
      data?: { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number };
    } | null;
    if (!response.ok || !body?.data) {
      return {
        configured: true,
        valid: false,
        tokenExpiresAt: null,
        dataAccessExpiresAt: null,
        message: responseError(body, response.statusText),
      };
    }
    const valid = body.data.is_valid === true;
    return {
      configured: true,
      valid,
      tokenExpiresAt: isoFromUnix(body.data.expires_at),
      dataAccessExpiresAt: isoFromUnix(body.data.data_access_expires_at),
      message: valid
        ? (body.data.expires_at ? 'Instagram token is valid.' : 'Instagram Page token has no fixed expiry date.')
        : 'Instagram access token is invalid or expired.',
    };
  } catch {
    return {
      configured: true,
      valid: null,
      tokenExpiresAt: null,
      dataAccessExpiresAt: null,
      message: 'Could not reach Meta to check the token.',
    };
  }
}

// Validates configuration and credentials without returning any secret values.
export async function GET(req: Request) {
  const platform = new URL(req.url).searchParams.get('platform') || 'all';
  if (!['youtube', 'instagram', 'all'].includes(platform)) {
    return NextResponse.json({ error: 'Platform must be youtube, instagram, or all.' }, { status: 400 });
  }

  const [youtube, instagram] = await Promise.all([
    platform === 'instagram' ? Promise.resolve(null) : youtubeStatus(),
    platform === 'youtube' ? Promise.resolve(null) : instagramStatus(),
  ]);
  const statuses = [youtube, instagram].filter((status): status is PlatformStatus => status !== null);
  const missing = [
    ...(youtube?.configured === false ? YOUTUBE_REQUIRED.filter(name => !process.env[name]?.trim()) : []),
    ...(instagram?.configured === false ? INSTAGRAM_REQUIRED.filter(name => !process.env[name]?.trim()) : []),
  ];
  const ready = statuses.every(status => status.configured && status.valid === true);

  return NextResponse.json({ ready, missing, platforms: { youtube, instagram } });
}
