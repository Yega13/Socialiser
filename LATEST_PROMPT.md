# Socialiser — Session Handoff (2026-03-25)

Read this ENTIRE file before doing anything. It contains full context from the previous session.

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

## MAJOR BUG: Scheduling Is Unreliable

**This is the #1 priority to fix.** The scheduling system has delays and errors. The current flow:
1. User creates a scheduled post → stored in `scheduled_posts` table with status "pending"
2. A cron endpoint (`/cron`) processes overdue posts
3. The cron calls `processScheduledPosts()` in `src/app/(app)/compose/actions.ts`

**Known issues:**
- Posts don't always go out on time — delays between scheduled time and actual posting
- Sometimes posts fail silently
- The cron reliability on Cloudflare Workers may be the root cause
- Token refresh during scheduled post processing may fail
- Need to investigate: is the cron being called reliably? Are there timeout issues on CF Workers?

**Files involved:**
- `src/app/(app)/compose/actions.ts` — `processScheduledPosts()` function (line ~228)
- `src/app/(app)/compose/page.tsx` — `handleSchedule()` function
- `src/app/cron/` — the cron endpoint
- `src/app/(app)/scheduled/` — scheduled posts page
- `supabase/schema.sql` — `scheduled_posts` table

**The user considers this the biggest problem with the product right now. Fix this before adding new features.**

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

### 1. FIX SCHEDULING (Critical)
The scheduling system is unreliable. This must be fixed before anything else. Investigate:
- Is the cron endpoint being called reliably on Cloudflare Workers?
- Are there timeout issues with `processScheduledPosts()`?
- Token refresh failures during scheduled posting?
- Silent failures — need better error logging and status reporting
- Consider: should we move to a more reliable scheduling mechanism?

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
