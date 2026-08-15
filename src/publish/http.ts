export async function apiError(response: Response, label: string): Promise<Error> {
  const body = await response.text();
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error?.message ?? parsed.error_description ?? parsed.message ?? body;
  } catch { /* keep the response text */ }
  return new Error(`${label} failed (${response.status}): ${detail || response.statusText}`);
}

export function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing social publishing settings: ${missing.join(', ')}`);
  return Object.fromEntries(names.map(name => [name, process.env[name]!.trim()]));
}
