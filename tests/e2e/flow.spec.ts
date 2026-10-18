import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Runs against the mock server started by playwright.config.ts (no keys, no network).
const sampleReviews = readFileSync(new URL("../../fixtures/sample-reviews.txt", import.meta.url), "utf8");

test("niche finder -> gap checker -> history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Mock mode: sample data, no network")).toBeVisible();

  // Stage 1: find niches for a broad category.
  await page.getByLabel("Category").fill("spreadsheet");
  await page.getByRole("button", { name: "Find niches" }).click();
  const irregular = page.getByRole("row").filter({ hasText: "Budget spreadsheet for irregular income" });
  const couples = page.getByRole("row").filter({ hasText: "Couples budget spreadsheet" });
  const habit = page.getByRole("row").filter({ hasText: "Habit tracker printable" });
  await expect(irregular).toContainText("Needs number");
  await expect(habit).toContainText("Easy to copy");

  // Enter the video's numbers: $13,990/month passes, $40/month is dead.
  await page.getByLabel("Top monthly revenue for Budget spreadsheet for irregular income").fill("13990");
  await page.getByLabel("Top monthly revenue for Couples budget spreadsheet").fill("40");
  await page.getByRole("button", { name: "Save numbers" }).click();
  await expect(irregular).toContainText("Pass");
  await expect(couples).toContainText("Below bar");
  await expect(page.getByRole("button", { name: /Check this niche/ })).toHaveCount(1);

  // Stage 2: the picked niche and its revenue carry over.
  await irregular.getByRole("button", { name: /Check this niche/ }).click();
  await expect(page.getByRole("tab", { name: "2. Check a niche" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Niche")).toHaveValue("Budget spreadsheet for irregular income");
  await expect(page.getByLabel("Top listing revenue / month")).toHaveValue("13990");

  await page.getByLabel(/3-star reviews/).fill(sampleReviews);
  await expect(page.getByText("10 reviews detected")).toBeVisible();
  await page.getByRole("button", { name: "Run check" }).click();

  const report = page.getByRole("region", { name: "Report" });
  await expect(report.getByText("Etsy demand proven")).toBeVisible();
  const top = report.getByRole("article", { name: "No way to budget an irregular income" });
  await expect(top.getByText("Validated")).toBeVisible();
  await expect(top.getByLabel("3 of 3 sources")).toBeVisible();
  await expect(top.getByText(/1 cited id didn’t exist and was ignored \(r999\)/)).toBeVisible();
  await expect(report.getByRole("article", { name: "Hard to use on a phone" }).getByText(/Low moat/)).toBeVisible();

  // Evidence links back to the source.
  await top.getByText(/Evidence \(\d+\)/).click();
  await expect(top.getByRole("link", { name: "Open thread" }).first()).toHaveAttribute("href", /reddit\.com/);

  // History lists both runs and reopens the report.
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText("1 passing of 8 candidates")).toBeVisible();
  await page.getByRole("button", { name: "Budget spreadsheet for irregular income" }).click();
  await expect(page.getByRole("region", { name: "Report" })).toContainText("Gaps for “Budget spreadsheet for irregular income”");
});

test("manual Reddit search links follow the niche and pasted threads count", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "2. Check a niche" }).click();
  await page.getByText("Reddit API not working? Paste threads instead").click();
  const links = page.getByRole("list", { name: "Reddit searches" });
  await expect(links).toContainText("(enter a niche first)");

  await page.getByLabel("Niche").fill("budget spreadsheet");
  await expect(links.getByRole("link")).toHaveCount(3);
  const first = links.getByRole("link").first();
  await expect(first).toHaveText('budget spreadsheet "I wish there was" ↗');
  await expect(first).toHaveAttribute("target", "_blank");
  const href = await first.getAttribute("href");
  expect(new URL(href!).searchParams.get("q")).toBe('budget spreadsheet "I wish there was"');

  await page.getByLabel("Pasted Reddit threads").fill("First pasted post\n\nSecond pasted post");
  await expect(page.getByText("(2 pasted)")).toBeVisible();
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.getByRole("region", { name: "Report" }).getByText("reddit (pasted): 2")).toBeVisible();
});

test("shows a readable error for an invalid niche", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "2. Check a niche" }).click();
  // Bypass the browser's own minLength check to exercise server validation.
  await page.getByLabel("Niche").evaluate((el) => el.removeAttribute("minlength"));
  await page.getByLabel("Niche").fill("x");
  await page.getByRole("button", { name: "Run check" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid request");
});
