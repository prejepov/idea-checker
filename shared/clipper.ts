// "Clip to Idea Checker" bookmarklet. You browse Reddit yourself; one click on the bookmark copies the
// post you're reading (or the text you highlighted) in the format the Gap Checker's paste box expects.
// It never navigates, scrolls or opens anything, and it leaves out usernames.
//
// extractClip, formatClip and clipperMain are serialized with Function.prototype.toString() into the
// bookmarklet, so each must be self-contained: no imports, no references to anything outside its own body.

export interface Clip {
  kind: "post" | "selection";
  title: string;
  body: string;
  subreddit: string | null;
  url: string | null;
}

/** Reads the open Reddit post (new or old Reddit), or the highlighted text if there is a selection. */
export function extractClip(doc: Document, href: string): Clip | null {
  const text = (el: Element | null | undefined) =>
    ((el && ((el as HTMLElement).innerText || el.textContent)) || "").trim();
  const u = new URL(href);
  const postPath = u.pathname.match(/^\/r\/([^/]+)\/comments\/([^/]+)/);
  const subFromUrl = u.pathname.match(/^\/r\/([^/]+)/);
  let subreddit: string | null = subFromUrl ? `r/${subFromUrl[1]}` : null;
  let url: string | null = postPath ? `https://www.reddit.com${u.pathname}` : null;
  let title = "";
  let body = "";

  const post = doc.querySelector("shreddit-post"); // new Reddit
  const thing = doc.querySelector("#siteTable .thing.link"); // old Reddit
  if (post) {
    title = post.getAttribute("post-title") || text(post.querySelector('[slot="title"]'));
    body = text(post.querySelector('[slot="text-body"]'));
    subreddit = post.getAttribute("subreddit-prefixed-name") || subreddit;
    const permalink = post.getAttribute("permalink");
    if (permalink) url = `https://www.reddit.com${permalink}`;
  } else if (thing) {
    title = text(thing.querySelector("a.title"));
    body = text(thing.querySelector(".usertext-body .md"));
    subreddit = thing.getAttribute("data-subreddit-prefixed") || subreddit;
    const permalink = thing.getAttribute("data-permalink");
    if (permalink) url = `https://www.reddit.com${permalink}`;
  }
  if (postPath && !title) {
    const og = doc.querySelector('meta[property="og:title"]');
    title = (og && og.getAttribute("content")) || "";
  }

  const selection = doc.defaultView?.getSelection?.();
  const selected = selection ? String(selection).trim() : "";
  if (selected) return { kind: "selection", title: postPath ? title : "", body: selected, subreddit, url };
  if (!postPath || !(title || body)) return null;
  return { kind: "post", title, body, subreddit, url };
}

/** One paste-box entry: no blank lines inside, usernames masked, ends with a blank line so clips stack. */
export function formatClip(clip: Clip): string {
  const clean = (s: string) =>
    s
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n\s*\n+/g, "\n")
      .replace(/\bu\/[A-Za-z0-9_-]{2,}/g, "u/[user]")
      .trim();
  const title = clean(clip.title).replace(/\n/g, " ");
  let body = clean(clip.body);
  if (body.length > 1200) body = `${body.slice(0, 1200).trimEnd()}…`;
  const where = [clip.kind === "selection" ? "excerpt" : null, clip.subreddit, clip.url].filter(Boolean).join(" · ");
  return `${[title, body, where ? `— ${where}` : ""].filter(Boolean).join("\n")}\n\n`;
}

function clipperMain(extract: typeof extractClip, format: typeof formatClip): void {
  const toast = (message: string, ok: boolean) => {
    const d = document.createElement("div");
    d.textContent = message;
    d.setAttribute("data-idea-checker-toast", ok ? "ok" : "error");
    Object.assign(d.style, {
      position: "fixed",
      zIndex: "2147483647",
      right: "16px",
      bottom: "16px",
      maxWidth: "380px",
      padding: "10px 14px",
      borderRadius: "8px",
      font: "14px system-ui, sans-serif",
      color: "#fff",
      background: ok ? "#1f6b3a" : "#a12c2c",
      boxShadow: "0 4px 16px rgba(0,0,0,.3)",
    });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3500);
  };
  if (!/(^|\.)reddit\.com$/.test(location.hostname)) {
    toast("Idea Checker clipper: open a Reddit post first.", false);
    return;
  }
  const clip = extract(document, location.href);
  if (!clip) {
    toast("Idea Checker: open a post, or highlight some text first.", false);
    return;
  }
  const out = format(clip);
  const label = (clip.title || clip.body).slice(0, 60);
  const done = () => toast(`Copied for Idea Checker: ${label}`, true);
  const fail = () => toast("Couldn't copy. Highlight the text and press Cmd+C instead.", false);
  const fallback = () => {
    const t = document.createElement("textarea");
    t.value = out;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.appendChild(t);
    t.select();
    let ok: boolean;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(out).then(done, () => (fallback() ? done() : fail()));
  } else if (fallback()) {
    done();
  } else {
    fail();
  }
}

/** The bookmark's URL: a javascript: link that runs the clipper on the current page. */
export function buildBookmarklet(): string {
  const source = `(${clipperMain.toString()})(${extractClip.toString()}, ${formatClip.toString()});`;
  return `javascript:${encodeURIComponent(source)}`;
}

/** Adds a clip to the paste box as its own paragraph; skips exact duplicates. */
export function appendClip(current: string, clipboard: string): { text: string; added: boolean; reason?: string } {
  const entry = clipboard.trim();
  if (!entry) return { text: current, added: false, reason: "The clipboard is empty." };
  const existing = current.split(/\n\s*\n/).map((s) => s.trim());
  if (existing.includes(entry)) return { text: current, added: false, reason: "Already added." };
  const base = current.trimEnd();
  return { text: base ? `${base}\n\n${entry}` : entry, added: true };
}
