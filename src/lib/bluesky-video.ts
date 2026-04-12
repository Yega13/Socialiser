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

    // Step 3: Upload video via XMLHttpRequest (real-time progress, 3 min timeout)
    const sizeMB = videoFile.size / 1024 / 1024;
    if (videoFile.size === 0) return { error: "Video file is empty (0 bytes)" };
    onStatus?.(`Uploading video to Bluesky (0/${sizeMB.toFixed(1)} MB)...`);
    const mimeType = videoFile instanceof File ? videoFile.type : "video/mp4";
    const uploadUrl = `https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?${new URLSearchParams({ did, name: fileName })}`;

    const uploadData = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${serviceToken}`);
      xhr.setRequestHeader("Content-Type", mimeType || "video/mp4");
      xhr.timeout = 180000;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
          onStatus?.(`Uploading video... ${loadedMB}/${sizeMB.toFixed(1)} MB (${pct}%)`);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error(`Invalid JSON response: ${xhr.responseText.slice(0, 200)}`)); }
        } else {
          let detail = `(${xhr.status})`;
          try {
            const errJson = JSON.parse(xhr.responseText);
            detail = errJson?.jobStatus?.error || errJson?.message || errJson?.error || xhr.responseText.slice(0, 200);
          } catch { detail = xhr.responseText.slice(0, 200) || `(${xhr.status})`; }
          reject(new Error(`Video upload failed: ${detail}`));
        }
      };
      xhr.onerror = () => reject(new Error("Video upload network error"));
      xhr.ontimeout = () => reject(new Error("Video upload timed out (3 min)"));

      const onAbort = () => xhr.abort();
      abort.signal.addEventListener("abort", onAbort, { once: true });
      xhr.onloadend = () => abort.signal.removeEventListener("abort", onAbort);

      xhr.send(videoFile);
    });

    // Step 4: Poll for processing completion (max 3 min, 2s interval)
    const jobId = uploadData.jobId as string | undefined;
    if (!jobId) return { blob: uploadData.blob as BskyBlob };

    onStatus?.("Processing video on Bluesky...");
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 1000));
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
          return { blob: job.blob as BskyBlob };
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
