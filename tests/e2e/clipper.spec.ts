import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// The bookmarklet runs on made-up Reddit pages served by Playwright itself. Any request that isn't
// to the local app or one of these fixtures is aborted, so nothing ever reaches Reddit.
const fixture = (name: string) => readFileSync(new URL(`../../fixtures/clipper/${name}`, import.meta.url), "utf8");
const PAGES: Record<string, string> = {
  "https://www.reddit.com/r/budget/comments/fx001/i_wish_there_was/": fixture("new-reddit-post.html"),
  "https://old.reddit.com/r/personalfinance/comments/fx002/why_is_there_no/": fixture("old-reddit-post.html"),
  "https://www.reddit.com/search/?q=budget": fixture("search-page.html"),
};

let bookmarklet = "";

test.beforeEach(async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(baseURL!)) return route.continue();
    const body = PAGES[url];
    return body ? route.fulfill({ body, contentType: "text/html" }) : route.abort();
  });
  // Take the bookmarklet exactly as the app offers it for dragging.
  await page.goto("/");
  await page.getByRole("tab", { name: "2. Check a niche" }).click();
  await page.getByText("Reddit API not working? Paste threads instead").click();
  bookmarklet = (await page.getByTestId("clipper-bookmarklet").getAttribute("href"))!;
  expect(bookmarklet.startsWith("javascript:")).toBe(true);
});

/** Clicks the bookmarklet the way a bookmark click runs it: as a javascript: link on the current page. */
async function clickBookmarklet(page: Page) {
  await page.evaluate((href) => {
    const a = document.createElement("a");
    a.href = href;
    a.id = "test-bookmarklet";
    a.textContent = "Clip";
    document.body.appendChild(a);
  }, bookmarklet);
  await page.click("#test-bookmarklet");
}

const clipboard = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test("clips a new-Reddit post without the author's name", async ({ page }) => {
  await page.goto("https://www.reddit.com/r/budget/comments/fx001/i_wish_there_was/");
  await clickBookmarklet(page);
  await expect(page.locator("[data-idea-checker-toast=ok]")).toContainText("Copied for Idea Checker");
  const text = await clipboard(page);
  expect(text).toBe(
    "I wish there was a budget sheet for irregular income\n" +
      "I'm self-employed and my pay changes every month.\n" +
      "Every template assumes a fixed paycheck. Asked u/[user] too.\n" +
      "— r/budget · https://www.reddit.com/r/budget/comments/fx001/i_wish_there_was/\n\n",
  );
  expect(text).not.toContain("fixture_author_name");
});

test("clips highlighted text (e.g. a comment) as an excerpt of the post", async ({ page }) => {
  await page.goto("https://www.reddit.com/r/budget/comments/fx001/i_wish_there_was/");
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("comment-1")!);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await clickBookmarklet(page);
  const text = await clipboard(page);
  expect(text).toContain("Same here, commission pay breaks every budget sheet I've tried.");
  expect(text).toContain("— excerpt · r/budget · https://www.reddit.com/r/budget/comments/fx001/i_wish_there_was/");
  expect(text).not.toContain("fixture_commenter");
});

test("works on old Reddit and links to www.reddit.com", async ({ page }) => {
  await page.goto("https://old.reddit.com/r/personalfinance/comments/fx002/why_is_there_no/");
  await clickBookmarklet(page);
  const text = await clipboard(page);
  expect(text.split("\n")[0]).toBe("Why is there no budget template for couples with separate accounts?");
  expect(text).toContain("— r/personalfinance · https://www.reddit.com/r/personalfinance/comments/fx002/why_is_there_no/");
  expect(text).not.toContain("fixture_author_two");
});

test("on a non-post page it asks you to open a post or highlight text", async ({ page }) => {
  await page.goto("https://www.reddit.com/search/?q=budget");
  await page.evaluate(() => navigator.clipboard.writeText("untouched"));
  await clickBookmarklet(page);
  await expect(page.locator("[data-idea-checker-toast=error]")).toContainText("open a post, or highlight some text");
  expect(await clipboard(page)).toBe("untouched");
});

test("Add from clipboard stacks clips as separate posts and skips duplicates", async ({ page }) => {
  const box = page.getByLabel("Pasted Reddit threads");
  const add = page.getByRole("button", { name: "Add from clipboard" });

  await page.evaluate(() => navigator.clipboard.writeText("First post title\nFirst body\n— r/budget\n\n"));
  await add.click();
  await expect(page.getByText("Added: First post title")).toBeVisible();
  await expect(page.getByText("(1 pasted)")).toBeVisible();

  await add.click();
  await expect(page.getByText("Already added.")).toBeVisible();

  await page.evaluate(() => navigator.clipboard.writeText("Second post\n— r/personalfinance\n\n"));
  await add.click();
  await expect(page.getByText("(2 pasted)")).toBeVisible();
  await expect(box).toHaveValue("First post title\nFirst body\n— r/budget\n\nSecond post\n— r/personalfinance");
});
