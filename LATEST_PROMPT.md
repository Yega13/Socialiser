# Socialiser — Session Handoff (2026-03-28)

Read this ENTIRE file before doing anything. It contains full context from the previous session.

---

## RULES (read before touching any code)

**Rule #1 — NEVER overwrite files. Only edit.**
Use Edit to make targeted changes: delete bad code, insert correct code. Never use Write on an existing file. If a file needs a complete architectural change, make it section by section using Edit, not a full replacement. This preserves git history and prevents accidental loss of working code.

---

## What Is Socialiser?

A social media cross-posting tool built with Next.js 16.1.6, TypeScript, Tailwind CSS v4, Supabase, deployed on Cloudflare Workers. Neo-brutalist design (lime #C8FF00, hard shadows, no border-radius, Geist font). The goal is to beat competitors like Metricool, Publer, Buffer by being simpler, faster, and more reliable.

## Tech Stack
- Next.js 16.1.6 (App Router) + React 19
- TypeScript, Tailwind CSS v4
- Supabase (auth + DB + storage)
- Deployed on Cloudflare Workers via @opennextjs/cloudflare v1.17.1
- npm (not bun)

## Critical Constraint
- **Cloudflare Workers cannot use route handlers** — they crash. Use Server Actions + browser Supabase client instead. See `memory/feedback_cloudflare_no_route_handlers.md`.

---

## What Works Right Now
- **YouTube**: Connect (OAuth), disconnect, video upload with custom thumbnails — all working
- **Instagram**: Connect (OAuth), disconnect, post images, carousels (2-10 items), reels, video posts, and stories — all working
- **Post type selection**: When uploading to Instagram, user picks post type via neo-brutalist chips:
  - Single image → Feed Post or Story
  - Single video → Video Post, Reel, or Story
  - Carousel (2+ files) → Carousel (auto, no choice needed)
- **Scheduling**: Working reliably with state machine cron — FIXED (see below)
- **Theme**: Light by default, persists user preference via localStorage
- **Preview**: Live preview panel showing how post looks on IG (with type badge) and YouTube
- **Image processing**: Aspect ratio cropping, padding, quality slider, brightness/contrast/saturation filters
- **Legal pages**: Privacy Policy (/privacy), Terms of Service (/tos), Content Policy (/content-policy) — all live
- **16 routes build cleanly**

## Platforms in Constants (src/lib/constants.ts)
- YouTube — LIVE, working
- Instagram — LIVE, working
- X/Twitter — coming soon
- LinkedIn — coming soon
- Threads — coming soon
- TikTok — coming soon
- Facebook — coming soon
- VK — coming soon
- Snapchat — coming soon
- Pinterest — coming soon
- Twitch — coming soon (added this session)
- Bluesky — coming soon (added this session)
- Mastodon — coming soon (added this session)

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

## What Was Built This Session (2026-03-28)

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
- `src/app/(app)/compose/page.tsx` — main compose/posting page (~1260 lines)
- `src/app/(app)/compose/actions.ts` — server actions for posting + scheduling (~447 lines)
- `src/app/(app)/dashboard/` — main dashboard
- `src/app/(app)/settings/` — settings page with theme toggle
- `src/app/(app)/scheduled/` — scheduled posts page
- `src/app/(marketing)/` — landing page (public)

### Config & Utils
- `src/lib/constants.ts` — SITE_CONFIG, PLATFORMS array (13 platforms)
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

### 1. Run the DB migration (Critical — do before deploying)
The migration SQL is in the "Scheduling: FIXED" section above. Run it in Supabase Dashboard → SQL Editor.

### 2. Landing Page Improvements
- Add FAQ section (SEO + user trust)
- Add engaging images/illustrations
- Add proper metatags and SEO optimization
- Keep it simple — don't repeat Metricool's wall-of-text mistake

### 3. Google OAuth Verification (for YouTube)
- Add your Gmail as test user in Google Cloud Console → OAuth consent screen → Test users
- Record 2-min demo video: connect YouTube → upload → confirm live
- Submit for verification (takes 1–4 weeks)

### 4. Landing Page Improvements
- Add FAQ section (SEO + user trust)
- Add engaging images/illustrations
- Add proper metatags and SEO optimization

### 5. Phase 2 Features (after scheduling is fixed)
- Media library (upload once, reuse anywhere)
- Post preview by platform (phone mockups)
- IG first comment scheduling
- Smart image auto-resize per platform
- Emoji picker in text editor
- Character counter per platform
- Analytics dashboard (better than Publer's from day one)

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

## Git Status (end of session 2026-03-28)
- Branch: master
- Modified: `src/app/(app)/compose/page.tsx`, `src/app/(app)/scheduled/page.tsx`, `src/components/layout/footer.tsx`
- New files: `src/app/(marketing)/privacy/page.tsx`, `src/app/(marketing)/tos/page.tsx`
- Changes are NOT committed yet — user hasn't asked for a commit
