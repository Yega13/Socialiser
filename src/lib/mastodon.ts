export function normalizeMastodonInstance(input: string): string {
  let s = input.trim().replace(/^@+/, "").replace(/\/+$/, "");
  if (!s) return "";
  // Handle formats: "user@host", "@user@host", "host", "https://host", "https://host/@user"
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      return `${url.protocol}//${url.host}`;
    } catch {
      return "";
    }
  }
  if (s.includes("@")) {
    const parts = s.split("@").filter(Boolean);
    s = parts[parts.length - 1];
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return "";
  return `https://${s}`;
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
