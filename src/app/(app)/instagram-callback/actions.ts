"use server";

export async function exchangeInstagramCode(
  code: string,
  redirectUri: string
): Promise<{
  success: boolean;
  error?: string;
  access_token?: string;
  expires_in?: number;
  ig_user_id?: string;
  ig_username?: string;
}> {
  try {
    const appId = process.env.FACEBOOK_APP_ID ?? "";
    const appSecret = process.env.FACEBOOK_APP_SECRET ?? "";

    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        }),
    );
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return { success: false, error: `No token: ${JSON.stringify(tokenData)}` };
    }

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenData.access_token,
        }),
    );
    const longTokenData = await longTokenRes.json();
    const accessToken = longTokenData.access_token ?? tokenData.access_token;
    const expiresIn = longTokenData.expires_in ?? 5184000; // default 60 days

    // Step 3: Get Facebook Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`,
    );
    const pagesData = await pagesRes.json();
    const pages = pagesData.data ?? [];

    if (pages.length === 0) {
      return {
        success: false,
        error: "No Facebook Pages found. Instagram Business accounts must be linked to a Facebook Page.",
      };
    }

    // Step 4: Find Instagram Business Account from Pages
    let igUserId: string | null = null;
    let igUsername: string | null = null;
    let pageAccessToken: string = accessToken;

    for (const page of pages) {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token ?? accessToken}`,
      );
      const igData = await igRes.json();

      if (igData.instagram_business_account?.id) {
        igUserId = igData.instagram_business_account.id;
        pageAccessToken = page.access_token ?? accessToken;

        // Get Instagram username
        const profileRes = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}?fields=username&access_token=${pageAccessToken}`,
        );
        const profileData = await profileRes.json();
        igUsername = profileData.username ?? null;
        break;
      }
    }

    if (!igUserId) {
      return {
        success: false,
        error: "No Instagram Business/Creator account found linked to your Facebook Pages.",
      };
    }

    return {
      success: true,
      access_token: pageAccessToken,
      expires_in: expiresIn,
      ig_user_id: igUserId,
      ig_username: igUsername ?? undefined,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
