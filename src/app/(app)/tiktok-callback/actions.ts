"use server";

const TIKTOK_OAUTH = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_USER_INFO = "https://open.tiktokapis.com/v2/user/info/";

export type TikTokTokenResult = {
  success: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  username?: string;
  display_name?: string;
};

export async function exchangeTikTokCode(
  code: string,
  redirectUri: string
): Promise<TikTokTokenResult> {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY ?? "";
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET ?? "";
    if (!clientKey || !clientSecret) {
      return { success: false, error: "TikTok credentials not configured on server" };
    }

    const tokenRes = await fetch(TIKTOK_OAUTH, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokenData = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
      const detail = tokenData.error_description || tokenData.error || `HTTP ${tokenRes.status}`;
      return { success: false, error: `Token exchange failed: ${detail}` };
    }

    const access_token = tokenData.access_token as string;
    const refresh_token = tokenData.refresh_token as string | undefined;
    const expires_in = tokenData.expires_in as number | undefined;
    const open_id = tokenData.open_id as string | undefined;

    let username: string | undefined;
    let display_name: string | undefined;
    try {
      const profRes = await fetch(
        `${TIKTOK_USER_INFO}?fields=open_id,username,display_name`,
        {
          headers: { Authorization: `Bearer ${access_token}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      const profData = await profRes.json().catch(() => ({}));
      if (profRes.ok && profData.data?.user) {
        username = profData.data.user.username as string | undefined;
        display_name = profData.data.user.display_name as string | undefined;
      }
    } catch {
      /* non-fatal — we already have open_id */
    }

    return {
      success: true,
      access_token,
      refresh_token,
      expires_in: expires_in ?? 86400,
      open_id,
      username,
      display_name,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
