/** The pain-point phrases from the video (12:12–12:35), used by the API search and the manual search links. */
export const PAIN_TEMPLATES = ['"I wish there was"', '"why is there no"', '"does anyone know how to"'];

export const painQuery = (niche: string, phrase: string) => `${niche.trim()} ${phrase}`;

/** A normal reddit.com search page for one pain phrase, for collecting posts by hand. */
export function redditSearchUrl(niche: string, phrase: string): string {
  return `https://www.reddit.com/search/?${new URLSearchParams({ q: painQuery(niche, phrase), type: "posts" })}`;
}
