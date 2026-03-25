/**
 * Client-side text content moderation.
 * Checks post text against blocklists of harmful content.
 * Returns a rejection reason if content violates policy, or null if clean.
 */

// Categories with associated patterns (lowercase).
// Each pattern is checked as a whole-word match to reduce false positives.
const BLOCKED_PATTERNS: Record<string, RegExp[]> = {
  "hate speech / slurs": [
    /\bn[-_]?i[-_]?g[-_]?g[-_]?(?:a|er|uh|ah?)s?\b/i,
    /\bf[-_]?a[-_]?g[-_]?(?:g[-_]?o[-_]?t|s)?\b/i,
    /\bk[-_]?i[-_]?k[-_]?e[-_]?s?\b/i,
    /\bs[-_]?p[-_]?i[-_]?c[-_]?s?\b/i,
    /\bch[-_]?i[-_]?n[-_]?k[-_]?s?\b/i,
    /\bw[-_]?e[-_]?t[-_]?b[-_]?a[-_]?c[-_]?k[-_]?s?\b/i,
    /\btr[-_]?a[-_]?n[-_]?n[-_]?(?:y|ie)s?\b/i,
    /\bre[-_]?t[-_]?a[-_]?r[-_]?d(?:ed|s)?\b/i,
  ],
  "violence / threats": [
    /\bi(?:'?ll|'?m\s+going?\s+to)\s+kill\s+(?:you|him|her|them|everyone)\b/i,
    /\bshoot\s+up\b/i,
    /\bbomb\s+threat\b/i,
    /\bm(?:ass\s+)?shoot(?:ing|er)\b/i,
    /\bgenocide\b/i,
    /\bethnic\s+cleansing\b/i,
  ],
  "terrorism": [
    /\bjoin\s+(?:isis|isil|al[- ]?qaeda|taliban)\b/i,
    /\brecruit(?:ing)?\s+(?:for\s+)?(?:jihad|terror)\b/i,
    /\bhow\s+to\s+make\s+a?\s*bombs?\b/i,
    /\bterrorist\s+attack\b/i,
  ],
  "sexual exploitation": [
    /\bchild\s+porn(?:ography)?\b/i,
    /\bcp\s+links?\b/i,
    /\bkiddie\s+porn\b/i,
    /\bunderage\s+(?:sex|nude|naked)\b/i,
    /\bcsam\b/i,
  ],
  "self-harm / suicide": [
    /\bkill\s+(?:my|your)self\b/i,
    /\bhow\s+to\s+(?:commit\s+)?suicide\b/i,
    /\bend\s+(?:it|my\s+life)\b/i,
  ],
  "harassment": [
    /\bkys\b/i,
    /\byou\s+should\s+(?:die|kill\s+yourself)\b/i,
    /\bgo\s+die\b/i,
    /\bi\s+hope\s+you\s+die\b/i,
    /\bdox(?:x)?(?:ed|ing)?\b/i,
    /\bswat(?:t)?(?:ed|ing)?\b/i,
  ],
};

export type ModerationResult = {
  blocked: boolean;
  category?: string;
  reason?: string;
};

/**
 * Checks text content against moderation rules.
 * Returns { blocked: false } if clean, or { blocked: true, category, reason } if flagged.
 */
export function moderateText(text: string): ModerationResult {
  if (!text || text.trim().length === 0) {
    return { blocked: false };
  }

  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return {
          blocked: true,
          category,
          reason: `Your post was blocked because it may contain ${category}. Please review and edit your content.`,
        };
      }
    }
  }

  return { blocked: false };
}

/**
 * Checks all text fields of a post (title + description).
 */
export function moderatePost(title: string, description?: string): ModerationResult {
  const titleResult = moderateText(title);
  if (titleResult.blocked) return titleResult;

  if (description) {
    const descResult = moderateText(description);
    if (descResult.blocked) return descResult;
  }

  return { blocked: false };
}
