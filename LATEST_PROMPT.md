# Socialiser — Session Handoff (2026-03-25)

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
- **Scheduling**: Posts can be scheduled for later — BUT THIS HAS ISSUES (see below)
- **Theme**: Light by default, persists user preference via localStorage
- **Preview**: Live preview panel showing how post looks on IG (with type badge) and YouTube
- **Image processing**: Aspect ratio cropping, padding, quality slider, brightness/contrast/saturation filters
- **12 routes build cleanly**

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

## What Was Built This Session

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

### 3. Legal Pages
- Terms & Conditions
- Privacy Policy
- Cookies Policy

### 4. Phase 2 Features (after scheduling is fixed)
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

## Git Status (end of session)
- Branch: master
- Modified: `src/app/(app)/compose/page.tsx`, `src/app/(app)/compose/actions.ts`, `src/lib/constants.ts`, `supabase/schema.sql`
- New files: `COMPETITIVE_ANALYSIS.md`, `IDEAS.md`, `LATEST_PROMPT.md`, `src/lib/moderation.ts`
- Changes are NOT committed yet — user hasn't asked for a commit
