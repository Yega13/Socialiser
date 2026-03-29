/**
 * Client-side Bluesky video upload — calls AT Protocol APIs directly from browser.
 * Video uploads MUST happen client-side because:
 * 1. Video files are too large for server action JSON payloads
 * 2. Cloudflare Workers have 30s CPU limits
 * 3. getServiceAuth must be called on the user's actual PDS (not bsky.social gateway)
 * 4. The official Bluesky web app also does this client-side
 *
 * Correct getServiceAuth params (confirmed by Bluesky error messages):
 *   aud = did:web:{pdsHost}  (user's PDS DID, e.g. did:web:stropharia.us-west.host.bsky.network)
 *   lxm = com.atproto.repo.uploadBlob  (NOT app.bsky.video.uploadVideo)
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
  const abort = new AbortController();
  // Hard 5-minute timeout for the entire operation
  const hardTimeout = setTimeout(() => abort.abort(), 5 * 60 * 1000);

  try {
    // Step 1: Resolve user's PDS host from DID document
    onStatus?.("Resolving Bluesky account...");
    let pdsHost = "bsky.social";
    let pdsEndpoint = "https://bsky.social";
    try {
      const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(did)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (plcRes.ok) {
        const plcData = await plcRes.json();
        const pdsService = plcData.service?.find(
          (s: { id: string; serviceEndpoint: string }) => s.id === "#atproto_pds"
        );
        if (pdsService?.serviceEndpoint) {
          const url = new URL(pdsService.serviceEndpoint);
          pdsHost = url.host;
          pdsEndpoint = pdsService.serviceEndpoint.replace(/\/$/, "");
        }
      }
    } catch { /* fallback to bsky.social */ }

    // Step 2: Get service auth token — aud = user's PDS DID
    onStatus?.("Getting video upload authorization...");
    const authRes = await fetch(
      `${pdsEndpoint}/xrpc/com.atproto.server.getServiceAuth?` +
        new URLSearchParams({
          aud: `did:web:${pdsHost}`,
          lxm: "com.atproto.repo.uploadBlob",
          exp: String(Math.floor(Date.now() / 1000) + 1800),
        }),
      { headers: { Authorization: `Bearer ${accessJwt}` }, signal: AbortSignal.timeout(15000) }
    );
    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}));
      return { error: `Video auth failed (${authRes.status}): ${err?.message || JSON.stringify(err)}` };
    }
    const { token: serviceToken } = await authRes.json();
    if (!serviceToken) {
      return { error: "Video auth returned empty token" };
    }

    // Step 3: Upload video directly to video.bsky.app (2 min timeout for upload)
    const sizeMB = videoFile.size / 1024 / 1024;
    onStatus?.(`Uploading video to Bluesky (${sizeMB.toFixed(1)} MB)...`);
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
        body: videoFile,
        signal: abort.signal,
      }
    );
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      let detail = `(${uploadRes.status})`;
      try {
        const errJson = JSON.parse(errText);
        // Bluesky wraps errors in jobStatus sometimes
        const msg = errJson?.jobStatus?.error || errJson?.message || errJson?.error;
        if (msg) detail = msg;
        else detail = errText.slice(0, 200);
      } catch {
        detail = errText.slice(0, 200) || `(${uploadRes.status})`;
      }
      return { error: `Video upload failed: ${detail}` };
    }
    const uploadData = await uploadRes.json();

    // Step 4: Poll for processing completion (max 3 min)
    const jobId = uploadData.jobId;
    if (!jobId) return { blob: uploadData.blob };

    onStatus?.("Processing video on Bluesky...");
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (abort.signal.aborted) return { error: "Video upload timed out" };
      try {
        const statusRes = await fetch(
          `https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`,
          { headers: { Authorization: `Bearer ${accessJwt}` }, signal: AbortSignal.timeout(10000) }
        );
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        const job = statusData.jobStatus;
        if (!job) continue;

        if (job.state === "JOB_STATE_COMPLETED") {
          return { blob: job.blob };
        }
        if (job.state === "JOB_STATE_FAILED") {
          return { error: job.error || "Video processing failed on Bluesky" };
        }
        if (job.progress != null) {
          const pct = job.progress > 1 ? Math.round(job.progress) : Math.round(job.progress * 100);
          onStatus?.(`Processing video... ${pct}%`);
        }
      } catch { /* retry */ }
    }
    return { error: "Video processing timed out (3 min)" };
  } catch (err) {
    if (abort.signal.aborted) return { error: "Video upload timed out (5 min limit)" };
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(hardTimeout);
  }
}
