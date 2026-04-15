"use server";

const FB_API = "https://graph.facebook.com/v23.0";

export type FacebookPage = {
  id: string;
  name: string;
  access_token: string;
  category?: string;
};

export async function exchangeFacebookCode(
  code: string,
  redirectUri: string
): Promise<{
  success: boolean;
  error?: string;
  long_user_token?: string;
  pages?: FacebookPage[];
}> {
  try {
    const appId = process.env.FACEBOOK_APP_ID ?? "";
    const appSecret = process.env.FACEBOOK_APP_SECRET ?? "";

    // Step 1: code → short-lived user token
    const shortRes = await fetch(
      `${FB_API}/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code,
        })
    );
    const shortData = await shortRes.json();
    if (!shortData.access_token) {
      return { success: false, error: `No token: ${JSON.stringify(shortData).slice(0, 300)}` };
    }

    // Step 2: short → long-lived user token (60d)
    const longRes = await fetch(
      `${FB_API}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortData.access_token,
        })
    );
    const longData = await longRes.json();
    const longUserToken = longData.access_token ?? shortData.access_token;

    // Step 3: fetch Pages the user admins (with Page tokens — these never expire when derived from long user token)
    const pagesRes = await fetch(
      `${FB_API}/me/accounts?fields=id,name,access_token,category&access_token=${encodeURIComponent(longUserToken)}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) {
      return { success: false, error: `Pages fetch: [${pagesData.error.code}] ${pagesData.error.message}` };
    }
    const pages: FacebookPage[] = (pagesData.data ?? []).map((p: { id: string; name: string; access_token: string; category?: string }) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token,
      category: p.category,
    }));

    if (pages.length === 0) {
      return { success: false, error: "No Facebook Pages found on this account. Create a Page first at facebook.com/pages/create." };
    }

    return { success: true, long_user_token: longUserToken, pages };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
