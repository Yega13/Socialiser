export function normalizeMastodonInstance(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function verifyMastodonToken(
  instance: string,
  token: string,
  timeoutMs = 8000
): Promise<{ id: string; acct: string; username: string } | null> {
  try {
    const res = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    return { id: String(data.id), acct: String(data.acct || data.username), username: String(data.username) };
  } catch {
    return null;
  }
}
