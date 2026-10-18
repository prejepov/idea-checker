import { describe, expect, it } from "vitest";
import {
  createRedditClient,
  mapPostListing,
  mapSubredditListing,
  PAIN_TEMPLATES,
  postsToEvidence,
} from "../../server/sources/reddit";
import { SourceSkipped } from "../../server/sources/errors";

const listing = (posts: Array<Record<string, unknown>>) => ({
  kind: "Listing",
  data: { children: posts.map((data) => ({ kind: "t3", data })) },
});

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  selftext: `Body ${id}`,
  subreddit: "personalfinance",
  subreddit_name_prefixed: "r/personalfinance",
  score: 12,
  permalink: `/r/personalfinance/comments/${id}/x/`,
  ...extra,
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("mapPostListing", () => {
  it("maps t3 children and builds full permalinks", () => {
    const [p] = mapPostListing(listing([post("a1")]));
    expect(p).toEqual({
      id: "a1",
      title: "Title a1",
      body: "Body a1",
      subreddit: "r/personalfinance",
      score: 12,
      url: "https://www.reddit.com/r/personalfinance/comments/a1/x/",
    });
  });

  it("truncates long bodies and ignores non-post children", () => {
    const raw = listing([post("a1", { selftext: "x".repeat(1000) })]);
    raw.data.children.push({ kind: "t1", data: post("comment") });
    const posts = mapPostListing(raw);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body.length).toBe(601); // 600 chars + ellipsis
  });

  it("returns [] for unexpected shapes", () => {
    expect(mapPostListing(null)).toEqual([]);
    expect(mapPostListing({ data: {} })).toEqual([]);
  });
});

describe("mapSubredditListing", () => {
  it("maps t5 children and skips NSFW ones", () => {
    const raw = {
      data: {
        children: [
          { kind: "t5", data: { display_name_prefixed: "r/googlesheets", subscribers: 1000, url: "/r/googlesheets/", public_description: "Sheets help" } },
          { kind: "t5", data: { display_name_prefixed: "r/nsfw", over18: true } },
        ],
      },
    };
    expect(mapSubredditListing(raw)).toEqual([
      { name: "r/googlesheets", subscribers: 1000, url: "https://www.reddit.com/r/googlesheets/", description: "Sheets help" },
    ]);
  });
});

describe("postsToEvidence", () => {
  it("tags posts r1..rN and keeps url + subreddit", () => {
    const evidence = postsToEvidence(mapPostListing(listing([post("a"), post("b", { selftext: "" })])));
    expect(evidence.map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(evidence[0]).toMatchObject({ source: "reddit", text: "Title a\nBody a", subreddit: "r/personalfinance" });
    expect(evidence[1]!.text).toBe("Title b");
  });
});

describe("createRedditClient", () => {
  it("skips (not fails) when keys are missing", async () => {
    const client = createRedditClient({});
    await expect(client.searchPainPosts("budget spreadsheet")).rejects.toBeInstanceOf(SourceSkipped);
  });

  it("authenticates once, searches every pain phrase, and de-duplicates posts", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("access_token")) return jsonResponse({ access_token: "tok", expires_in: 3600 });
      return jsonResponse(listing([post("same"), post(`p${calls.length}`)]));
    };
    const client = createRedditClient({ clientId: "id", clientSecret: "secret", userAgent: "ua-test", fetchImpl });
    const posts = await client.searchPainPosts("budget spreadsheet");

    const tokenCalls = calls.filter((c) => c.url.includes("access_token"));
    const searchCalls = calls.filter((c) => c.url.includes("oauth.reddit.com/search"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]!.init?.body).toBe("grant_type=client_credentials");
    expect(searchCalls).toHaveLength(PAIN_TEMPLATES.length);
    expect(new URL(searchCalls[0]!.url).searchParams.get("q")).toBe('budget spreadsheet "I wish there was"');
    expect((searchCalls[0]!.init?.headers as Record<string, string>)["User-Agent"]).toBe("ua-test");
    // "same" appears in every response but is kept once.
    expect(posts.filter((p) => p.id === "same")).toHaveLength(1);
    expect(posts).toHaveLength(1 + PAIN_TEMPLATES.length);
  });

  it("surfaces auth failures as errors", async () => {
    const client = createRedditClient({
      clientId: "id",
      clientSecret: "bad",
      fetchImpl: async () => jsonResponse({ error: "invalid_grant" }, 401),
    });
    await expect(client.searchSubreddits("spreadsheet")).rejects.toThrow("HTTP 401");
  });
});
