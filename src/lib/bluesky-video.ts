/**
 * Client-side Bluesky video upload — calls AT Protocol APIs directly from browser.
 * Video uploads MUST happen client-side because:
 * 1. Video files are too large for server action JSON payloads
 * 2. Cloudflare Workers have 30s CPU limits
 * 3. getServiceAuth must be called on the user's actual PDS (not bsky.social gateway)
 * 4. The official Bluesky web app also does this client-side
 */

export type BskyBlob = {
  $type: string;
  ref: { $link: string };
  mimeType: string;
  size: number;
};

export async function uploadBlueskyVideo(
  accessJwt: string,
  did: string,
  videoFile: File | Blob,
  fileName: string,
  onStatus?: (msg: string) => void,
): Promise<{ blob?: BskyBlob; error?: string }> {
  try {
    // Step 1: Resolve user's PDS endpoint from DID document
    onStatus?.("Resolving Bluesky account...");
    let pdsEndpoint = "https://bsky.social";
    try {
      const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`);
      if (plcRes.ok) {
        const plcData = await plcRes.json();
        const pdsService = plcData.service?.find(
          (s: { id: string; serviceEndpoint: string }) => s.id === "#atproto_pds"
        );
        if (pdsService?.serviceEndpoint) {
          pdsEndpoint = pdsService.serviceEndpoint.replace(/\/$/, "");
        }
      }
    } catch { /* fallback to bsky.social */ }

    // Step 2: Get service auth token from user's PDS
    // Try PDS first, fall back to bsky.social if PDS rejects
    onStatus?.("Getting video upload authorization...");
    let serviceToken: string | null = null;

    const endpoints = [pdsEndpoint, ...(pdsEndpoint !== "https://bsky.social" ? ["https://bsky.social"] : [])];
    for (const endpoint of endpoints) {
      const authRes = await fetch(
        `${endpoint}/xrpc/com.atproto.server.getServiceAuth?` +
          new URLSearchParams({
            aud: "did:web:video.bsky.app",
            lxm: "app.bsky.video.uploadVideo",
            exp: String(Math.floor(Date.now() / 1000) + 1800),
          }),
        { headers: { Authorization: `Bearer ${accessJwt}` } }
      );
      if (authRes.ok) {
        const data = await authRes.json();
        if (data.token) {
          serviceToken = data.token;
          break;
        }
      }
    }

    if (!serviceToken) {
      return { error: "Could not get video upload authorization from Bluesky" };
    }

    // Step 3: Upload video directly to video.bsky.app
    onStatus?.("Uploading video to Bluesky...");
    const mimeType = videoFile instanceof File ? videoFile.type : "video/mp4";
    const uploadRes = await fetch(
      `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?` +
        new URLSearchParams({ did, name: fileName }),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          "Content-Type": mimeType || "video/mp4",
        },
        body: videoFile, // Send raw file — no base64
      }
    );
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      return { error: `Video upload failed (${uploadRes.status}): ${err?.message || err?.error || JSON.stringify(err)}` };
    }
    const uploadData = await uploadRes.json();

    // Step 4: Poll for processing completion
    const jobId = uploadData.jobId;
    if (!jobId) return { blob: uploadData.blob };

    onStatus?.("Processing video on Bluesky...");
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const statusRes = await fetch(
          `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
          { headers: { Authorization: `Bearer ${accessJwt}` } }
        );
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        const state = statusData.jobStatus?.state;
        if (state === "JOB_STATE_COMPLETED") {
          return { blob: statusData.jobStatus.blob };
        }
        if (state === "JOB_STATE_FAILED") {
          return { error: statusData.jobStatus?.error || "Video processing failed on Bluesky" };
        }
        const progress = statusData.jobStatus?.progress;
        if (progress) onStatus?.(`Processing video... ${Math.round(progress * 100)}%`);
      } catch { /* retry */ }
    }
    return { error: "Video processing timed out (4 min)" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
