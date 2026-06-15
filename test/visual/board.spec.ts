import { test, expect, type Page } from "@playwright/test";

/**
 * Settled-state visual regression. Each scenario paints the board and we capture
 * it at rest, with CSS animations frozen — Playwright stores a baseline and, on
 * any drift, shows the actual/expected/diff overlay in the HTML report.
 *
 * First paint snaps straight to the target (no intro flap), so a `reset` with a
 * value gives us a deterministic resting board with no ticking required.
 */

const board = (page: Page) => page.locator(".sf-board");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__flap !== "undefined");
});

async function snapAtRest(
  page: Page,
  seed: number,
  opts: { value?: string; flag?: string[] }
) {
  await page.evaluate(([s, o]) => window.__flap.reset(s as number, o), [
    seed,
    opts,
  ] as const);
  // Let React paint the first (snapped) frame.
  await board(page).waitFor({ state: "visible" });
  await page.waitForTimeout(150);
}

test("plain centered message", async ({ page }) => {
  await snapAtRest(page, 1, { value: "HELLO WORLD" });
  await expect(board(page)).toHaveScreenshot("plain.png");
});

test("balanced multi-line wrap", async ({ page }) => {
  await snapAtRest(page, 2, {
    value: "the quick brown fox jumps over the lazy dog",
  });
  await expect(board(page)).toHaveScreenshot("wrapped.png");
});

test("flag border around the perimeter", async ({ page }) => {
  await snapAtRest(page, 3, {
    value: "PEACE",
    flag: ["#C8102E", "#FFFFFF", "#012169"],
  });
  await expect(board(page)).toHaveScreenshot("flag-border.png");
});

test("complex script renders shrunk-to-fit", async ({ page }) => {
  await snapAtRest(page, 4, { value: "నమస్తే" }); // Telugu "namaste"
  await expect(board(page)).toHaveScreenshot("complex-script.png");
});

test("dense Kannada clusters fit fixed-width cards", async ({ page }) => {
  await snapAtRest(page, 8, { value: "ನಮಸ್ಕಾರ ಪ್ರಪಂಚ" });
  await expect(board(page)).toHaveScreenshot("kannada-dense-clusters.png");
});

test("near-black flag stripe reads as a blank tile", async ({ page }) => {
  await snapAtRest(page, 5, { value: "DARK", flag: ["#050505", "#ff0000"] });
  await expect(board(page)).toHaveScreenshot("near-black-stripe.png");
});

test("custom glyph mark (→) is drawn as an SVG", async ({ page }) => {
  await page.evaluate(() => window.__flap.reset(6, { value: "" }));
  await board(page).waitFor({ state: "visible" });
  await page.evaluate(() =>
    window.__flap.setMessage("A → B", [], /* useArrowMark */ true)
  );
  // Let the retarget effect schedule the first frame, then drive the clock to
  // rest and let the folds retire so faces show landed glyphs.
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    for (let i = 0; i < 600 && window.__flap.pendingFrames() > 0; i++)
      window.__flap.tick(60);
  });
  await page.waitForTimeout(300);
  await expect(board(page)).toHaveScreenshot("custom-mark.png");
});
