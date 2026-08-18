import fs from 'fs';
import { apiError, requireEnv } from './http';

interface YouTubeUploadInput {
  videoPath: string;
  thumbnailPath?: string;
  title: string;
  description: string;
  tags: string[];
}

async function accessToken(): Promise<string> {
  const env = requireEnv(['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) throw await apiError(response, 'YouTube authorization');
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('YouTube authorization did not return an access token.');
  return data.access_token;
}

export async function uploadToYouTube(input: YouTubeUploadInput): Promise<{ videoId: string; url: string }> {
  const token = await accessToken();
  const size = fs.statSync(input.videoPath).size;
  const privacy = process.env.YOUTUBE_PRIVACY_STATUS?.trim() || 'private';
  if (!['private', 'unlisted', 'public'].includes(privacy)) {
    throw new Error('YOUTUBE_PRIVACY_STATUS must be private, unlisted, or public.');
  }

  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(size),
      'X-Upload-Content-Type': 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 5000),
        tags: input.tags,
        categoryId: process.env.YOUTUBE_CATEGORY_ID?.trim() || '22',
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) throw await apiError(init, 'Starting YouTube upload');
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return an upload URL.');

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(size) },
    body: fs.readFileSync(input.videoPath),
  });
  if (!upload.ok) throw await apiError(upload, 'YouTube video upload');
  const video = await upload.json() as { id?: string };
  if (!video.id) throw new Error('YouTube upload succeeded but returned no video ID.');

  if (input.thumbnailPath && fs.existsSync(input.thumbnailPath)) {
    const thumb = fs.readFileSync(input.thumbnailPath);
    const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(video.id)}&uploadType=media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'Content-Length': String(thumb.length) },
      body: thumb,
    });
    if (!response.ok) {
      const warning = await apiError(response, 'YouTube thumbnail upload');
      console.warn(`${warning.message} The video was still published successfully.`);
    }
  }

  return { videoId: video.id, url: `https://youtu.be/${video.id}` };
}
