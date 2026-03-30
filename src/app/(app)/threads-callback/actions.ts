"use server";

export async function exchangeThreadsCode(
  code: string,
  redirectUri: string
): Promise<{
  success: boolean;
  error?: string;
  access_token?: string;
  expires_in?: number;
  threads_user_id?: string;
  threads_username?: string;
}> {
  try {
    const appId = process.env.THREADS_APP_ID ?? "";
    const appSecret = process.env.THREADS_APP_SECRET ?? "";

    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return { success: false, error: `No token: ${JSON.stringify(tokenData)}` };
    }

    const userId = String(tokenData.user_id);

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.threads.net/access_token?` +
        new URLSearchParams({
          grant_type: "th_exchange_token",
          client_secret: appSecret,
          access_token: tokenData.access_token,
        }),
    );
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token ?? tokenData.access_token;
    const expiresIn = longTokenData.expires_in ?? 5184000; // default 60 days

    // Step 3: Get Threads username
    const profileRes = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`,
    );
    const profileData = await profileRes.json();
    const threadsUsername = profileData.username ?? null;
    const threadsUserId = profileData.id ?? userId;

    return {
      success: true,
      access_token: accessToken,
      expires_in: expiresIn,
      threads_user_id: String(threadsUserId),
      threads_username: threadsUsername ?? undefined,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
