/**
 * Resolve a Bluesky user's actual PDS endpoint from their DID.
 *
 * Users on bsky.social return "https://bsky.social". Users on self-hosted
 * or third-party PDSes return their real endpoint. This matters because
 * uploadBlob + createRecord MUST go to the same PDS — otherwise the record
 * references a blob the PDS doesn't have ("Could not find blob" error).
 */
export async function resolveBlueskyPDS(did: string): Promise<string> {
  try {
    const res = await fetch(`https://plc.directory/${encodeURIComponent(did)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "https://bsky.social";
    const data = await res.json();
    const svc = (data.service as { id: string; serviceEndpoint: string }[] | undefined)
      ?.find((s) => s.id === "#atproto_pds");
    const endpoint = svc?.serviceEndpoint?.replace(/\/$/, "");
    return endpoint || "https://bsky.social";
  } catch {
    return "https://bsky.social";
  }
}
