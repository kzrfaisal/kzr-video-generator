export async function apiError(response: Response, label: string): Promise<Error> {
  const body = await response.text();
  let detail = body;
  try {
    const parsed = JSON.parse(body);
    detail = parsed.error?.message ?? parsed.error_description ?? parsed.message ?? body;
  } catch { /* keep the response text */ }
  const requestId = response.headers.get('x-fb-request-id');
  const traceId = response.headers.get('x-fb-trace-id');
  const diagnostics = [
    requestId ? `request ${requestId}` : null,
    traceId ? `trace ${traceId}` : null,
  ].filter(Boolean).join(', ');
  return new Error(
    `${label} failed (${response.status}): ${detail || response.statusText}${diagnostics ? ` [Meta ${diagnostics}]` : ''}`,
  );
}

export function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter(name => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Missing social publishing settings: ${missing.join(', ')}`);
  return Object.fromEntries(names.map(name => [name, process.env[name]!.trim()]));
}
