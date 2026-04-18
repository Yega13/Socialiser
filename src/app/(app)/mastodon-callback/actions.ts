"use server";

import { createClient } from "@supabase/supabase-js";
import { normalizeMastodonInstance } from "@/lib/mastodon";

const SCOPES = "read:accounts write:statuses write:media";
const APP_NAME = "Socializer";
const APP_WEBSITE = "https://socialiser.yeganyansuren13.workers.dev";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function registerAppForInstance(
  instance: string,
  redirectUri: string
): Promise<{ clientId: string; clientSecret: string } | { error: string }> {
  const db = serviceClient();

  const { data: existing } = await db
    .from("mastodon_apps")
    .select("client_id, client_secret")
    .eq("instance", instance)
    .maybeSingle();

  if (existing?.client_id && existing?.client_secret) {
    return { clientId: existing.client_id, clientSecret: existing.client_secret };
  }

  try {
    const form = new URLSearchParams({
      client_name: APP_NAME,
      redirect_uris: redirectUri,
      scopes: SCOPES,
      website: APP_WEBSITE,
    });
    const res = await fetch(`${instance}/api/v1/apps`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { error: `Register app failed (${res.status}): ${err.slice(0, 200)}` };
    }
    const data = await res.json();
    if (!data.client_id || !data.client_secret) {
      return { error: "Instance did not return client credentials" };
    }

    await db.from("mastodon_apps").upsert({
      instance,
      client_id: data.client_id,
      client_secret: data.client_secret,
    });

    return { clientId: data.client_id, clientSecret: data.client_secret };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function beginMastodonOAuth(
  handleOrInstance: string,
  userId: string,
  origin: string
): Promise<{ authUrl?: string; error?: string }> {
  const instance = normalizeMastodonInstance(handleOrInstance);
  if (!instance) return { error: "Invalid instance. Example: mastodon.social or @you@mastodon.social" };
  if (!userId) return { error: "Not logged in" };

  const redirectUri = `${origin.replace(/\/+$/, "")}/mastodon-callback`;
  const app = await registerAppForInstance(instance, redirectUri);
  if ("error" in app) return { error: app.error };

  const host = instance.replace(/^https?:\/\//, "");
  const state = `${userId}|${host}`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: app.clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return { authUrl: `${instance}/oauth/authorize?${params.toString()}` };
}

export async function exchangeMastodonCode(
  code: string,
  instanceHost: string,
  origin: string
): Promise<
  | { success: true; instance: string; accessToken: string; account: { id: string; username: string; acct: string } }
  | { success: false; error: string }
> {
  const instance = `https://${instanceHost}`;
  const db = serviceClient();

  const { data: app } = await db
    .from("mastodon_apps")
    .select("client_id, client_secret")
    .eq("instance", instance)
    .maybeSingle();

  if (!app?.client_id || !app?.client_secret) {
    return { success: false, error: "App credentials missing for this instance. Reconnect." };
  }

  try {
    const redirectUri = `${origin.replace(/\/+$/, "")}/mastodon-callback`;
    const tokRes = await fetch(`${instance}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: app.client_id,
        client_secret: app.client_secret,
        redirect_uri: redirectUri,
        scope: SCOPES,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokRes.ok) {
      const err = await tokRes.text().catch(() => "");
      return { success: false, error: `Token exchange failed (${tokRes.status}): ${err.slice(0, 200)}` };
    }
    const tokData = await tokRes.json();
    if (!tokData.access_token) return { success: false, error: "No access token returned" };

    const accRes = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${tokData.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!accRes.ok) return { success: false, error: "Could not verify account after OAuth" };
    const accData = await accRes.json();
    if (!accData.id) return { success: false, error: "verify_credentials returned no id" };

    return {
      success: true,
      instance,
      accessToken: tokData.access_token,
      account: {
        id: String(accData.id),
        username: String(accData.username),
        acct: String(accData.acct || accData.username),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
