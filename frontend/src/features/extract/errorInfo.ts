import type { ErrorCode } from "@/lib/api";

// UI copy for each error code: a plain-language title (cause) and hint (fix),
// plus which recovery affordances the error UI should offer.
//
// `unexpected` marks codes that indicate a likely bug on our side (as opposed to
// expected outcomes like a blocked site or a page with no recipe). Only these
// show the "Report it on GitHub" action — see reportIssueUrl below.
export interface ErrorInfo {
  title: string;
  hint: string;
  canPaste: boolean; // offer the paste-HTML fallback
  canEdit: boolean; // offer "Edit link" (refocus the URL field)
  canRetry: boolean; // offer "Try again"
  unexpected: boolean; // offer "Report it on GitHub"
}

const ERROR_INFO: Record<ErrorCode, ErrorInfo> = {
  invalid_url: {
    title: "That doesn't look like a link",
    hint: "Paste the full web address of a recipe page, starting with https://.",
    canPaste: false,
    canEdit: true,
    canRetry: false,
    unexpected: false,
  },
  blocked_url: {
    title: "We can't open that address",
    hint: "Parsley only fetches public recipe pages — local and private addresses are blocked. Try a public recipe link.",
    canPaste: false,
    canEdit: true,
    canRetry: false,
    unexpected: false,
  },
  no_recipe: {
    title: "No recipe found on that page",
    hint: "We loaded the page but couldn't find a recipe. Make sure the link opens the recipe itself — not a homepage or category.",
    canPaste: false,
    canEdit: true,
    canRetry: false,
    unexpected: false,
  },
  site_blocked: {
    title: "That site blocked our reader",
    hint: "Some sites block automated readers. Open the page yourself and paste its HTML below — we'll extract straight from it.",
    canPaste: true,
    canEdit: false,
    canRetry: false,
    unexpected: false,
  },
  fetch_failed: {
    title: "Hmm. That page wouldn't load",
    hint: "The site didn't respond as expected. Try again, or paste the page's HTML to skip the fetch.",
    canPaste: true,
    canEdit: false,
    canRetry: true,
    unexpected: true,
  },
  rate_limited: {
    title: "Whoa — one at a time",
    hint: "You've made a lot of requests at once. We're catching our breath — wait a minute, then try again.",
    canPaste: false,
    canEdit: false,
    canRetry: true,
    unexpected: false,
  },
  network: {
    title: "Couldn't reach Parsley",
    hint: "Check your connection and try again.",
    canPaste: false,
    canEdit: false,
    canRetry: true,
    unexpected: false,
  },
  unknown: {
    title: "Something went wrong",
    hint: "That's on us — an unexpected error. Try again, and if it keeps happening, let us know.",
    canPaste: false,
    canEdit: false,
    canRetry: true,
    unexpected: true,
  },
};

export function errorInfo(code: ErrorCode): ErrorInfo {
  return ERROR_INFO[code] ?? ERROR_INFO.unknown;
}

// Shown when a retry has failed too and no fallback remains, so the window
// collapses to just "Report on GitHub" — reached only for `unexpected` codes
// with no paste fallback (paste, when available, outlives a failed retry).
export const RETRY_STUCK: Pick<ErrorInfo, "title" | "hint"> = {
  title: "Weird. Still nothing",
  hint: "Two tries, no response — that one's on us, not you.",
};

// A failed paste is the end of the recovery road: the pasted page itself gave
// us nothing, so reporting is all that's left.
export const PASTE_DEAD: Pick<ErrorInfo, "title" | "hint"> = {
  title: "Not today",
  hint: "Even the pasted page gave us nothing we could read as a recipe. That one's on us — report it and we'll fix it.",
};

const REPO = "tomerav83/parsley";

// Build a prefilled GitHub "new issue" URL. We use `body` (not `template`) so the
// dynamic context survives — GitHub ignores `body` when a `template` is set. The
// `extraction-failure` label must exist in the repo or it's silently dropped.
export function reportIssueUrl(code: ErrorCode, sourceUrl: string): string {
  const host = sourceUrl.replace(/^https?:\/\//, "").split("/")[0] || "a page";
  const title = `[extract] ${code} on ${host}`;
  const body = [
    "Thanks for reporting — this was prefilled by Parsley.",
    "",
    `**Error code:** \`${code}\``,
    `**Recipe URL:** ${sourceUrl || "(none)"}`,
    `**When:** ${new Date().toISOString()}`,
    `**Browser:** ${navigator.userAgent}`,
    "",
    "**What I expected:** a clean recipe.",
    "**What happened:** extraction failed with the code above.",
    "",
    "<!-- Anything else that helps (the site, screenshots, etc.) -->",
  ].join("\n");
  const params = new URLSearchParams({
    labels: "extraction-failure",
    title,
    body,
  });
  return `https://github.com/${REPO}/issues/new?${params.toString()}`;
}
