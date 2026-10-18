import { PAIN_TEMPLATES, painQuery } from "../../shared/reddit";
import type { EvidenceItem, Subreddit } from "../../shared/schema";
import { SourceSkipped, type FetchLike } from "./errors";

export { PAIN_TEMPLATES };

export interface RedditConfig {
  clientId?: string;
  clientSecret?: string;
  userAgent?: string;
  fetchImpl?: FetchLike;
}

export interface RedditPost {
  id: string;
  title: string;
  body: string;
  subreddit: string;
  score: number;
  url: string;
}

const MAX_POSTS = 60;
const BODY_CHARS = 600;

interface RawListing {
  data?: { children?: Array<{ kind?: string; data?: Record<string, unknown> }> };
}

/** Maps a Reddit search listing to posts. Pure, so it can be tested with saved responses. */
export function mapPostListing(json: unknown): RedditPost[] {
  const children = (json as RawListing)?.data?.children ?? [];
  const posts: RedditPost[] = [];
  for (const child of children) {
    const d = child.data;
    if (child.kind !== "t3" || !d || typeof d.id !== "string") continue;
    const body = typeof d.selftext === "string" ? d.selftext : "";
    posts.push({
      id: d.id,
      title: String(d.title ?? ""),
      body: body.length > BODY_CHARS ? `${body.slice(0, BODY_CHARS)}…` : body,
      subreddit: String(d.subreddit_name_prefixed ?? `r/${String(d.subreddit ?? "")}`),
      score: typeof d.score === "number" ? d.score : 0,
      url: `https://www.reddit.com${String(d.permalink ?? "")}`,
    });
  }
  return posts;
}

export function mapSubredditListing(json: unknown): Subreddit[] {
  const children = (json as RawListing)?.data?.children ?? [];
  const subs: Subreddit[] = [];
  for (const child of children) {
    const d = child.data;
    if (child.kind !== "t5" || !d) continue;
    if (d.over18 === true) continue;
    subs.push({
      name: String(d.display_name_prefixed ?? ""),
      subscribers: typeof d.subscribers === "number" ? d.subscribers : 0,
      url: `https://www.reddit.com${String(d.url ?? "")}`,
      description: String(d.public_description ?? "").slice(0, 200),
    });
  }
  return subs;
}

export function postsToEvidence(posts: RedditPost[], startAt = 1): EvidenceItem[] {
  return posts.map((p, i) => ({
    id: `r${i + startAt}`,
    source: "reddit" as const,
    text: p.body ? `${p.title}\n${p.body}` : p.title,
    url: p.url,
    subreddit: p.subreddit,
  }));
}

export function createRedditClient(cfg: RedditConfig) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  let token: { value: string; expiresAt: number } | null = null;

  function requireConfig() {
    if (!cfg.clientId || !cfg.clientSecret) {
      throw new SourceSkipped("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set");
    }
    return { id: cfg.clientId, secret: cfg.clientSecret, ua: cfg.userAgent || "idea-checker/0.1" };
  }

  async function getToken(): Promise<string> {
    const { id, secret, ua } = requireConfig();
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const res = await fetchImpl("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": ua,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`Reddit auth failed: HTTP ${res.status}`);
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error("Reddit auth returned no access_token");
    token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function get(path: string, params: Record<string, string>): Promise<unknown> {
    const { ua } = requireConfig();
    const accessToken = await getToken();
    const url = `https://oauth.reddit.com${path}?${new URLSearchParams({ ...params, raw_json: "1" })}`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": ua },
    });
    if (!res.ok) throw new Error(`Reddit ${path} failed: HTTP ${res.status}`);
    return res.json();
  }

  return {
    /** Searches the niche + each pain phrase, de-duplicated, capped at 60 posts. */
    async searchPainPosts(niche: string): Promise<RedditPost[]> {
      const seen = new Set<string>();
      const posts: RedditPost[] = [];
      for (const phrase of PAIN_TEMPLATES) {
        const json = await get("/search", {
          q: painQuery(niche, phrase),
          limit: "25",
          sort: "relevance",
          t: "all",
          type: "link",
        });
        for (const post of mapPostListing(json)) {
          if (seen.has(post.id)) continue;
          seen.add(post.id);
          posts.push(post);
        }
      }
      return posts.slice(0, MAX_POSTS);
    },

    async searchSubreddits(category: string): Promise<Subreddit[]> {
      const json = await get("/subreddits/search", { q: category, limit: "15" });
      return mapSubredditListing(json);
    },
  };
}

export type RedditClient = ReturnType<typeof createRedditClient>;
