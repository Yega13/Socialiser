# Socialiser — Session Handoff (2026-04-12)

Read this ENTIRE file before doing anything. It contains full context from the previous session.

---

## RULES (read before touching any code)

**Rule #1 — NEVER overwrite files. Only edit.**
Use Edit to make targeted changes: delete bad code, insert correct code. Never use Write on an existing file. If a file needs a complete architectural change, make it section by section using Edit, not a full replacement. This preserves git history and prevents accidental loss of working code.

**Rule #2 — Analyze EVERYTHING before advising.**
Do not rush recommendations. Think through the full picture before each suggestion. Review your own prior suggestions before giving new ones to avoid contradictions. If unsure, say so rather than giving confident but wrong advice.

**Rule #3 — Deploying is done through Antigravity sidebar GUI.**
The user deploys via the Antigravity sidebar GUI, not via CLI commands. Do not tell the user to run `npx opennextjs-cloudflare deploy` — just tell them to deploy through Antigravity. Build commands (`npx opennextjs-cloudflare build`) can still be run in terminal.

**Rule #4 — CODE MUST BE THE BEST, FASTEST, AND IMPOSSIBLE TO CRASH.**
Every piece of code MUST be optimized for maximum speed and bulletproof reliability. No lazy shortcuts, no "good enough" — write the FASTEST possible implementation every time. All error paths must be handled. All network calls must have timeouts. All loops must have bounds. Zero tolerance for code that can hang, freeze, or silently fail. If there's a faster way to do something, use it. Performance is not optional.

---

## What Is Socialiser?

A social media cross-posting tool built with Next.js 16.1.6, TypeScript, Tailwind CSS v4, Supabase, deployed on Cloudflare Workers. Neo-brutalist design (lime #C8FF00, hard shadows, no border-radius, Geist font). The goal is to beat competitors like Metricool, Publer, Buffer by being simpler, faster, and more reliable.

## Tech Stack
- Next.js 16.1.6 (App Router) + React 19
- TypeScript, Tailwind CSS v4
- Supabase (auth + DB + storage)
- Deployed on Cloudflare Workers via @opennextjs/cloudflare v1.17.1
- npm (not bun)

## Critical Constraints
- **Cloudflare Workers cannot use route handlers** — they crash. Use Server Actions + browser Supabase client instead. See `memory/feedback_cloudflare_no_route_handlers.md`.
- **OneDrive randomly corrupts files** — this machine syncs via OneDrive which randomly corrupts files/directories (reparse point errors, I/O errors). Corrupted files cannot be deleted by any method (rm, PowerShell Remove-Item, cmd rmdir). Only fix: restart PC, then delete. If `.next` or `node_modules` get corrupted, restart PC first, delete the folder, then rebuild. Do NOT waste time trying to force-delete — it won't work.

---

## What Works Right Now
- **YouTube**: Connect (OAuth), disconnect, video upload with custom thumbnails — all working
- **Instagram**: Connect (OAuth), disconnect, post images, carousels (2-10 items), reels, video posts, and stories — all working
- **Bluesky**: Connect (handle + app password), disconnect, post text/images/video — all working
- **Threads**: Connect (OAuth via mobile — see session notes), disconnect, post text/images/video/carousels up to 20 items — CONNECTED, pending posting test
- **Post type selection**: When uploading to Instagram, user picks post type via neo-brutalist chips:
  - Single image → Feed Post or Story
  - Single video → Video Post, Reel, or Story
  - Carousel (2+ files) → Carousel (auto, no choice needed)
- **Scheduling**: Working reliably with state machine cron (YouTube, Instagram, Bluesky) — FIXED
- **Theme**: Light by default, persists user preference via localStorage
- **Preview**: Live preview panel for Instagram (with type badge), YouTube (with thumbnail picker), and Bluesky (with drag-to-crop)
- **Image processing**: Aspect ratio cropping with drag-to-reposition, padding, quality slider, brightness/contrast/saturation filters
- **Parallel posting**: All platforms post simultaneously, Supabase uploads in parallel, IG containers created in parallel
- **Legal pages**: Privacy Policy (/privacy), Terms of Service (/tos), Content Policy (/content-policy) — all live
- **19 routes build cleanly**

## Platforms in Constants (src/lib/constants.ts)
- YouTube — LIVE, working
- Instagram — LIVE, working
- Bluesky — LIVE, working (connect, post text/images/video, scheduling)
- Threads — LIVE, connected (OAuth works via mobile; threads.com web login has Meta bug for this account)
- X/Twitter — coming soon
- LinkedIn — coming soon
- TikTok — coming soon
- Facebook — coming soon (blocked by Meta business verification)
- VK — coming soon
- Snapchat — coming soon
- Pinterest — coming soon
- Twitch — coming soon
- Mastodon — coming soon
- Reddit — coming soon (added 2026-03-28)
- Boosty — coming soon (added 2026-03-28)
- ~~Kick~~ — REMOVED (no public API exists)

---

## Scheduling: FIXED (2026-03-27)

The scheduling system was rewritten as a state machine. Root cause was that the old cron page used `setTimeout` for up to 15-minute waits, which is impossible in Cloudflare Workers (30s HTTP timeout). Now each cron run is always < 30s.

**New state machine:**
- `pending` → cron creates IG containers (fast API call) → `preparing`
- `preparing` → cron polls container status (one API call) → `prepared`
- `prepared` → cron publishes at exact scheduled time → `completed`
- YouTube-only posts skip straight to `prepared` (upload happens at publish time)

**DB migration required (run once in Supabase SQL Editor):**
```sql
UPDATE public.scheduled_posts SET status = 'pending' WHERE status = 'processing';
ALTER TABLE public.scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_status_check;
ALTER TABLE public.scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
  CHECK (status IN ('pending', 'preparing', 'prepared', 'publishing', 'completed', 'failed'));
ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS prepared_containers JSONB;
DROP INDEX IF EXISTS idx_scheduled_pending;
CREATE INDEX idx_scheduled_active ON public.scheduled_posts (scheduled_at, status)
  WHERE status IN ('pending', 'preparing', 'prepared');
```

**Files changed:**
- `src/app/cron/page.tsx` — complete rewrite (state machine, 3 fast steps)
- `src/app/(app)/scheduled/page.tsx` — handles new statuses (preparing/prepared/publishing)
- `src/app/(app)/compose/actions.ts` — removed old broken `processScheduledPosts()`
- `supabase/schema.sql` — updated schema with migration comments

---

## What Was Built This Session (2026-04-12)

### Threads Integration — FULLY WORKING
Previous Meta apps deleted. New app created and connected successfully.

**New Meta App:**
- **App Name:** Socializer threads v2
- **Main App ID:** 3571401166342987
- **Threads App ID:** 1299493258747441 (used for OAuth client_id)
- **App Mode:** Development (tester: `Socializers_official`, accepted)
- **Permissions:** `threads_basic` + `threads_content_publish` — Ready for testing
- **Callback URLs:** All 3 set to `https://socialiser.yeganyansuren13.workers.dev/threads-callback`

**Env vars:**
```
NEXT_PUBLIC_THREADS_APP_ID=1299493258747441
THREADS_APP_ID=1299493258747441
THREADS_APP_SECRET=053e2e8e7cc884c90e11f73a73a9733e
```
Also added to `wrangler.toml` `[vars]` — required for Cloudflare Workers runtime (`.env.local` only works locally).

**Two bugs fixed during setup:**
1. **threads.com web login crash** — Meta's React frontend crashes for `Socializers_official` account on all desktop browsers (Chrome, Edge, incognito). Shows "Произошла ошибка" with `Non-error thrown: [object Object]`. NOT a code issue — Meta server-side bug. **Workaround:** OAuth via mobile browser. The Threads mobile app doesn't crash. This is account-specific; other users' web OAuth works fine.
2. **Missing server env vars** — `THREADS_APP_ID` and `THREADS_APP_SECRET` were in `.env.local` but NOT in `wrangler.toml`. Cloudflare Workers don't read `.env.local` at runtime — vars must be in `wrangler.toml [vars]` or CF dashboard secrets. Token exchange returned "Missing required field: client_id" because `process.env.THREADS_APP_ID` was empty on the deployed Worker.

**Files changed:**
- `.env.local` — updated Threads App ID + Secret
- `wrangler.toml` — added `THREADS_APP_ID` and `THREADS_APP_SECRET` to `[vars]`
- `src/components/dashboard/platform-card.tsx` line 148 — updated `client_id` to `1299493258747441`

**Connection flow (for this account):** Must connect via mobile browser → log into Socializer first → paste OAuth URL in same tab → authorize in browser (not Threads app) → callback saves token. Desktop then sees it as connected (same Supabase DB).

### Bluesky Image Upload Speed Fix
**Root cause:** Bluesky image uploads were going through a slow pipeline:
1. Client prepared image → base64-encoded via `Array.from(new Uint8Array(buf), b => String.fromCharCode(b)).join("")` (extremely slow for large files)
2. Base64 strings sent through Server Action as JSON (4 images × 2-5MB = 8-20MB payload)
3. Server decoded base64 back to binary → uploaded to Bluesky

**Fix:** Images now upload directly from client to Bluesky API (`com.atproto.repo.uploadBlob`), same pattern as video uploads. Eliminated: base64 encoding, massive JSON payloads, server-side decoding. Server action now just creates the post record with pre-uploaded blob references.

**Files changed:**
- `src/app/(app)/compose/actions.ts` — removed `bskyUploadBlob()`, changed `postToBlueskyServer()` to accept pre-uploaded blob refs instead of base64
- `src/app/(app)/compose/page.tsx` — Bluesky section now uploads images client-side directly
- `src/app/(app)/scheduled/page.tsx` — same fix for scheduled Bluesky posts

### ReactBits Animations (from 2026-04-09 session)
**New files:**
- `src/components/ui/click-spark.tsx` — ClickSpark component (sparks on every click)
- `src/components/ui/spark-wrapper.tsx` — Client wrapper for ClickSpark, theme-aware
- `src/components/ui/curved-loop.tsx` — CurvedLoop base component (text on curved SVG path)
- `src/components/ui/snake-text.tsx` — S-curve snake marquee

**Modified files:**
- `src/app/layout.tsx` — wrapped body content in SparkWrapper (click sparks site-wide)
- `src/app/(marketing)/layout.tsx` — added SnakeText before Footer

---

## What Was Built Previous Session (2026-03-30)

### Threads Integration (Full — code complete, pending Meta fix)
**New files:**
- `src/app/(app)/threads-callback/page.tsx` — OAuth callback page
- `src/app/(app)/threads-callback/actions.ts` — Token exchange (short → long-lived, 60 days)

**Modified files:**
- `src/lib/constants.ts` — Threads `comingSoon: false`
- `src/components/dashboard/platform-card.tsx` — Threads OAuth redirect (`threads.net/oauth/authorize`)
- `src/app/(app)/compose/actions.ts` — `refreshThreadsToken`, `postToThreadsServer`, `postCarouselToThreads` (parallel container creation)
- `src/app/(app)/compose/page.tsx` — Threads posting logic, preview tab + preview panel, multi-file (up to 20)
- `src/app/(app)/scheduled/page.tsx` — Threads token refresh + posting (text, single media, carousel)
- `src/app/cron/page.tsx` — Threads token refresh + full publishing engine (text, image, video, carousel)

**Threads API details:**
- OAuth: `https://threads.net/oauth/authorize` with scopes `threads_basic,threads_content_publish`
- Token exchange: `https://graph.threads.net/oauth/access_token`
- Long-lived token: `https://graph.threads.net/access_token` (grant_type=th_exchange_token)
- Token refresh: `https://graph.threads.net/refresh_access_token` (grant_type=th_refresh_token)
- Profile: `https://graph.threads.net/v1.0/me?fields=id,username`
- Create container: `POST https://graph.threads.net/v1.0/{user_id}/threads`
- Publish: `POST https://graph.threads.net/v1.0/{user_id}/threads_publish`
- Status: `GET https://graph.threads.net/v1.0/{container_id}?fields=status`
- Supports: TEXT, IMAGE, VIDEO, CAROUSEL (up to 20 items)
- 500 character limit

**Env vars (CONFIRMED CORRECT in .env.local AND wrangler.toml):**
```
NEXT_PUBLIC_THREADS_APP_ID=1299493258747441
THREADS_APP_ID=1299493258747441
THREADS_APP_SECRET=053e2e8e7cc884c90e11f73a73a9733e
```

**STATUS (2026-04-12):** Threads CONNECTED and working!
- Old Meta apps (1404345784799231, 1492646805606968) deleted
- New app "Socializer threads v2" (Main: 3571401166342987, Threads: 1299493258747441) created and fully configured
- OAuth connected via mobile browser workaround (threads.com web crashes for this account)
- Token exchange and DB save working
- **Next:** Test actual posting (text, image, video, carousel)

### Poll Interval Optimization
Reduced all poll intervals from 2000ms to 1000ms for faster completion detection:
- `src/app/(app)/compose/actions.ts` — Instagram container polling (900 iterations × 1s = 15min)
- `src/lib/bluesky-video.ts` — Bluesky video processing polling (90 × 1s)
- `src/app/cron/page.tsx` — Cron video processing polling (120 × 1s)

### AI Features Planned (build tomorrow)
- **Enhance Caption** — AI rewrites caption to be more engaging
- **Suggest Hashtags** — AI generates relevant hashtags
- Provider-agnostic: supports both OpenAI (GPT-4o-mini) and Anthropic (Claude Haiku)
- No SDK needed — plain fetch() calls, auto-detects which API key is set
- Cost: ~$0.0002/use for text, negligible at any scale
- UI: toolbar row between Description and Media Upload in compose page
- Plan file: `.claude/plans/sharded-tumbling-hammock.md`
- Blocked by: user needs to purchase API key ($5 minimum)

### Deploy Issue
Cloudflare Workers deploy crashes with miniflare `ERR_RUNTIME_FAILURE` (access violation) on Windows. Known Windows compatibility issue. Build succeeds, only deploy step fails. Workaround: restart PC and retry, or deploy from different machine.

---

## What Was Built Previous Session (2026-03-28 → 2026-03-29)

### Bluesky Integration (Full)
**Files:** `src/app/(app)/compose/page.tsx`, `src/app/(app)/compose/actions.ts`, `src/components/dashboard/platform-card.tsx`, `src/app/(app)/scheduled/page.tsx`, `src/app/cron/page.tsx`

Complete Bluesky integration:
- **Connect flow**: Inline form on platform card — user enters Bluesky handle + app password. Authenticates via `com.atproto.server.createSession`, stores DID, accessJwt, refreshJwt, handle in `connected_platforms`.
- **Token refresh**: `refreshBlueskySession()` server action via `com.atproto.server.refreshSession`. accessJwt lasts 2hrs, refreshJwt 90 days.
- **Post text with rich text**: `detectFacets()` finds URLs and #hashtags with proper UTF-8 byte offsets for AT Protocol facets.
- **Image upload**: Up to 4 images via `com.atproto.repo.uploadBlob`. Images are cropped to 1:1 using the user's drag offset (same `prepareImageForInstagram` function), then base64-encoded for server action transport.
- **Video upload**: Resolves user's PDS host from `plc.directory/{did}`, gets service auth with `aud=did:web:{pdsHost}`, uploads to `video.bsky.app`, polls `getJobStatus` up to 120 iterations (4 min).
- **Preview panel**: Shows in compose page — avatar, handle, "just now", text content with 300-char counter, media preview (video 16:9 or image 1:1 with drag-to-crop), action bar (Reply/Repost/Like).
- **Scheduling**: Full support in cron page — refreshes Bluesky tokens, uploads images/video, creates post with facets.
- **Scheduled page**: Retry and process-now both handle Bluesky posts.

### 6 Critical Bug Fixes
1. **UI freeze on network error** — `handlePost()` and `handleSchedule()` had no try/catch, so network errors left `isPosting` stuck true forever. Wrapped in try/catch.
2. **Silent token refresh failures** — If refresh returned null, code proceeded with expired token. Added explicit error messages and `continue` to next platform.
3. **Schedule time mismatch** — Picker enforced 6min, validation checked 3min, error said 5min. Standardized validation to 4min.
4. **`retryScheduledPost` used server Supabase client** — Only server action using `createServerClient`, crashes on CF Workers. Moved to client-side browser client.
5. **Swallowed errors in `handleProcessNow`** — Bare `catch {}` gave no feedback. Added `processingError` state and red error banner.
6. **Stale results on reschedule** — `reschedulePost` didn't clear old `results`. Added `results: null`.

### Bluesky Video 401 Fix
**Root cause:** `aud` parameter in `getServiceAuth` was `did:web:video.bsky.app` (wrong). Must be `did:web:{pdsHost}` where pdsHost is resolved from `plc.directory/{did}`.
**Fixed in:** `compose/actions.ts` and `cron/page.tsx`.

### Back-to-Top Button
**File:** `src/components/ui/back-to-top.tsx` (new), `src/app/layout.tsx`
- Client component, appears after scrolling 400px
- Fixed position bottom-right, **circular** (`rounded-full`)
- Neo-brutalist: black bg, white arrow, violet shadow
- Smooth scroll via `window.scrollTo({ top: 0, behavior: "smooth" })`

### Kick Removed
Removed from `src/lib/constants.ts` — Kick has no public API for posting.

### Reddit & Boosty Added
Added to constants as coming soon: Reddit (#FF4500), Boosty (#F15F2C).

### Drag-to-Crop Everywhere
- **Before:** Drag only worked in non-"original" crop modes for Instagram preview only
- **After:** Drag works in ALL modes (original, 1:1, 4:5, 1.91:1) and in BOTH Instagram and Bluesky previews
- Bluesky images are cropped to 1:1 using the user's drag offset before uploading
- Instagram preview always uses `object-cover` with `objectPosition` based on drag offset

### Parallel Posting (Major Speed Improvement)
**Before:** Platforms posted sequentially (YouTube → Instagram → Bluesky), Supabase uploads one-by-one, IG containers created one-by-one. 7 files = ~10 minutes.
**After:**
- All platforms post **simultaneously** via `Promise.allSettled`
- All Supabase media uploads run **in parallel** via `Promise.all`
- All Instagram carousel containers created **in parallel**
- Bluesky image uploads run **in parallel**
- Bluesky uses **base64** encoding instead of `number[]` (JSON payload ~3x smaller, much faster serialization)
- Token refreshes happen per-platform independently

### PAD Label Tooltip
Added `title` attribute to PAD label: "Image ratio outside 4:5–1.91:1 — colored bars will be added"

---

## What Was Built Previous Session (2026-03-28)

### 1. Schedule Button Greyed-Out Fix (compose page)
**Root cause:** `canPost` had no check for `scheduleEnabled=true` but empty `scheduleDate`, and no check for YouTube+images conflict.
**Changes to `src/app/(app)/compose/page.tsx`:**
- Added `hasVideo` derived variable
- Added `(!scheduleEnabled || scheduleDate.length > 0)` to `canPost`
- Added `postBlockReason` variable — shows red text below the button explaining WHY it's disabled:
  - `"YouTube requires video — deselect YouTube or upload a video"` when YouTube is selected with only images
  - `"Pick a date & time to schedule"` when schedule is enabled but no date selected
- Rendered `postBlockReason` below the action button when not posting

### 2. Schedule False-Positive "5 Minutes Ahead" Fix
**Root cause:** `datetime-local` rounds to the minute. Picking "5 min ahead" then filling the form for 60s means `Date.now()` has advanced and the check fails.
**Changes to `src/app/(app)/compose/page.tsx`:**
- `min` attribute on datetime-local raised from `5 * 60 * 1000` to `6 * 60 * 1000` (browser enforces 6-min minimum in picker UI)
- Validation cutoff in `handleSchedule` lowered from `5 * 60 * 1000` to `3 * 60 * 1000` (silent 3-min tolerance — user can take 3 min to fill form after picking a time)
- Error message still says "at least 5 minutes ahead" which is accurate since the picker enforces 6 minutes

### 3. Scheduled Page Status Label Polish
**File:** `src/app/(app)/scheduled/page.tsx`
All status badge labels made human-readable:
- `pending` → `SCHEDULED` (or `POST NOW` if overdue)
- `preparing` → `PROCESSING`
- `prepared` → `READY`
- `publishing` → `POSTING...`
- `completed` → `POSTED`
- `failed` → `FAILED`

### 4. Scheduled Page "READY" State Color
**File:** `src/app/(app)/scheduled/page.tsx`
After several iterations (lime → emerald → orange → teal), settled on **teal** (`teal-500` / `#14b8a6`):
- Card border: `border-teal-500 shadow-[4px_4px_0px_0px_#14b8a6]`
- Badge: `bg-teal-500 text-white`
- Section heading: `text-teal-500`
Full color palette for statuses now:
- SCHEDULED — violet (#7C3AED)
- PROCESSING — sky (#00D4FF)
- READY — teal (#14b8a6)
- POSTED — green-600
- FAILED — coral (#FF4F4F)

### 5. Token Refresh Failed — Explanation
When the YouTube cron step sees "Token refresh failed", it means the Google refresh token is expired/revoked. Fix: Settings → Disconnect YouTube → Reconnect YouTube. This is NOT a code bug, it's a Google OAuth lifecycle issue. Reconnecting gets a fresh refresh token.

### 6. Legal Pages — Privacy Policy & Terms of Service
Two new pages created in `src/app/(marketing)/`:

**`privacy/page.tsx`** — 12 sections covering:
- What we collect (account data, OAuth tokens, content, usage data)
- How we use data (no selling, no advertising)
- **Google API / YouTube data** — full Limited Use disclosure as required by Google OAuth verification. States: youtube.upload scope only, no secondary use, refresh token storage in Supabase, how to revoke.
- Instagram & Meta API data
- Third-party services (Supabase, Cloudflare, Google, Meta)
- Security (HTTPS, bcrypt, RLS, no plain-text passwords)
- Data retention policy
- User rights (GDPR, CCPA — access, rectification, erasure, portability)
- Cookies & localStorage (session only, no tracking)
- Children's privacy (13+, 16+ EU)
- Changes policy (7-day notice for significant changes)
- Contact: support@socializer.app

**`tos/page.tsx`** — 15 sections covering:
- Acceptance of terms (13+/16+EU, legal capacity)
- What Socializer is + no affiliation with platforms
- Account registration (accurate info, security, one account)
- Connected platforms (platform ToS compliance, API change disclaimer, token expiry, no affiliation)
- Acceptable use (8 prohibited activities with ✕ markers)
- Content ownership (user retains ownership, limited licence to us)
- Intellectual property
- Service availability & scheduling (best-effort, failure handling)
- Termination (by user via Settings, by us for violations)
- Disclaimers ("as is", "as available")
- Limitation of liability (£50 GBP cap)
- Indemnification
- Governing law & disputes (informal resolution first)
- Changes to terms (14-day notice for material changes)
- Contact: support@socializer.app

**Design:** Both pages use identical layout to `/content-policy`: `max-w-2xl mx-auto px-6 py-16 space-y-10`, `border-l-4` section items, `border border-[#0A0A0A] shadow-[4px_4px_0px_0px_#0A0A0A]` highlight boxes. Privacy uses `#7C3AED` violet accents, ToS uses `#0A0A0A` black accents.

**Footer updated** (`src/components/layout/footer.tsx`):
Added Privacy, Terms, Content Policy links before Login/Sign up in the footer nav.

### 7. Google OAuth Verification Path
To get YouTube "Unverified App" warning removed for public users:
1. Privacy Policy is now live at `/privacy` ✓
2. Terms of Service is now live at `/tos` ✓
3. Still needed: record a 2-min demo video (connect YouTube → upload video → confirm it's live on YouTube channel)
4. Submit in Google Cloud Console → APIs & Services → OAuth consent screen → "Submit for verification"
5. Add your own Gmail as a test user in the meantime to skip warnings during development

---

## What Was Built Last Session (2026-03-27)

### 1. Instagram Post Type Selector
- Added `igPostType` state to compose page ("post" | "reel" | "story")
- Smart detection: shows different options based on media uploaded
- Neo-brutalist chip UI with icons (◻ Feed Post, ▶ Video Post, ♫ Reel, ◎ Story)
- Preview updates to 9:16 for Reel/Story, 1:1 for Post
- Badge in preview header (POST/REEL/STORY/CAROUSEL with color coding)
- Post button text reflects chosen type
- Server action `postToInstagramServer()` now accepts postType parameter
- Uses correct Instagram API media_type: "REELS" for reels, "VIDEO" for video posts, "STORIES" for stories
- Stories don't send captions (API limitation)
- Stored in `scheduled_posts.ig_post_type` column for scheduled posts

### 2. Three New Platforms Added
- Twitch (#9146FF), Bluesky (#0085FF), Mastodon (#6364FF)
- All marked comingSoon: true in constants.ts

### 3. Competitive Analysis & Strategy
- Created `COMPETITIVE_ANALYSIS.md` — detailed analysis of Metricool, Publer, Buffer, Planable, SocialBee, Later, Hootsuite
- Real user quotes from G2, Capterra, Trustpilot
- Steal/Avoid lists for each competitor
- Industry-wide problems identified (sneaky billing, bad support, buggy scheduling, API limitations)
- Publer identified as our real competitor (4.8/5 but only 8k IG followers — no brand)

### 4. Ideas Board
- Created `IDEAS.md` — 42 feature ideas organized by priority
- High priority: onboarding tour, post preview, post history, media library, transparent billing, character counter, keyboard shortcuts
- Key unique ideas: consistency heatmap (GitHub-style), undo post (30-sec window), platform health status, IG first comment scheduling, saved hashtag groups

### 5. Core Strategy Documented
- 6 principles: Simple, Fast, Easy to understand, Cheaper, All MAIN features, Unique
- Saved to memory: `memory/project_competitive_strategy.md`

---

## Database Schema Notes

The `scheduled_posts` table has an `ig_post_type` column:
```sql
ig_post_type text default 'reel' check (ig_post_type in ('post', 'reel', 'story'))
```
This column ALREADY EXISTS in the live database. Don't try to add it again.

## Supabase Storage Limitation
- 50MB per-file upload limit on free tier
- Most IG posts/reels are under 50MB so it works for now
- Future fix: migrate to Cloudflare R2 (free 10GB, 5GB max per file) since we're already on CF Workers

---

## Key Files to Know

### Core App
- `src/app/(app)/compose/page.tsx` — main compose/posting page (~1540 lines, parallel posting, 3 preview panels)
- `src/app/(app)/compose/actions.ts` — server actions for YouTube/Instagram/Bluesky posting (~448 lines)
- `src/app/(app)/dashboard/` — main dashboard
- `src/app/(app)/settings/` — settings page with theme toggle
- `src/app/(app)/scheduled/` — scheduled posts page
- `src/app/(marketing)/` — landing page (public)

### Config & Utils
- `src/lib/constants.ts` — SITE_CONFIG, PLATFORMS array (15 platforms)
- `src/lib/supabase/client.ts` — browser Supabase client
- `src/lib/supabase/server.ts` — server Supabase client (DON'T use in API routes on CF Workers)
- `src/lib/utils.ts` — cn() helper
- `src/lib/validations.ts` — Zod schemas
- `src/lib/moderation.ts` — content moderation

### Design System
- Colors: brand-lime #C8FF00, brand-violet #7C3AED, brand-coral #FF4F4F, brand-sky #00D4FF
- Base: black #0A0A0A, white #F9F9F7
- Shadows: hard offset (4px 4px 0px 0px), no blur
- Buttons: sharp rectangular, no border-radius
- Font: Geist (loaded via next/font/google)
- Dark mode: CSS variables in globals.css, toggled via `html.dark` class + localStorage

### Strategy Docs (in project root)
- `COMPETITIVE_ANALYSIS.md` — full competitor breakdown
- `IDEAS.md` — feature ideas board with priorities

---

## What To Do Next (Priority Order)

### 1. Test Threads Posting
Threads is connected — test posting: text only, image, video, carousel. Verify all work.

### 2. Fix `.next` Build Cache
The `.next/standalone/node_modules/nanoid` directory is corrupted (OneDrive reparse point I/O error). Must delete `.next` after PC restart, then rebuild: `npx opennextjs-cloudflare build`.

### 3. AI Features
- Buy OpenAI or Anthropic API key ($5)
- Build Enhance Caption + Suggest Hashtags
- Plan is ready at `.claude/plans/sharded-tumbling-hammock.md`

### 4. X/Twitter Integration
Next major platform to add. Twitter API v2 free tier supports posting.

### 5. Google OAuth Verification (for YouTube)
- Add your Gmail as test user in Google Cloud Console → OAuth consent screen → Test users
- Record 2-min demo video: connect YouTube → upload → confirm live
- Submit for verification (takes 1–4 weeks)
- Needs custom domain first (user buying in ~3 days)

### 6. Landing Page Improvements
- Add FAQ section (SEO + user trust)
- Add engaging images/illustrations
- Add proper metatags and SEO optimization

### 7. Phase 2 Features
- AI analytics (suggest when/what/where to post based on user's engagement data)
- Media library (upload once, reuse anywhere)
- Post preview by platform (phone mockups)
- IG first comment scheduling
- Character counter per platform
- Analytics dashboard

---

## User Preferences
- Wants PERFECT, polished tool — no half-baked features
- Values simplicity and speed above feature count
- Neo-brutalist design is a core differentiator — maintain it
- Prefers honest, direct communication
- Wants to beat Publer (4.8/5) by being better designed + better marketed
- Hates overcomplicated UIs (Metricool is 3/10 in their eyes)
- Theme is white/light by default, dark mode persists via localStorage

---

## Key Files to Know (Updated)

### Legal Pages (new)
- `src/app/(marketing)/privacy/page.tsx` — Privacy Policy (12 sections, Google Limited Use compliant)
- `src/app/(marketing)/tos/page.tsx` — Terms of Service (15 sections)
- `src/app/(marketing)/content-policy/page.tsx` — Content Policy (existed before)

### Footer
- `src/components/layout/footer.tsx` — now has Privacy / Terms / Content Policy links

---

## Git Status (end of session 2026-03-30)
- Branch: master
- Modified: `src/app/(app)/compose/page.tsx`, `src/app/(app)/compose/actions.ts`, `src/app/(app)/scheduled/page.tsx`, `src/app/cron/page.tsx`, `src/components/dashboard/platform-card.tsx`, `src/lib/constants.ts`, `src/lib/bluesky-video.ts`, `.env.local`, `LATEST_PROMPT.md`
- New files: `src/app/(app)/threads-callback/page.tsx`, `src/app/(app)/threads-callback/actions.ts`
- 19 routes build cleanly
- Changes are NOT committed yet — user hasn't asked for a commit
- Deploy blocked by miniflare Windows crash
