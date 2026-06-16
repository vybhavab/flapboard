import { test, expect, type Page } from "@playwright/test";

/**
 * Settled-state visual regression. Each scenario paints the board and we capture
 * it at rest, with CSS animations frozen — Playwright stores a baseline and, on
 * any drift, shows the actual/expected/diff overlay in the HTML report.
 *
 * First paint snaps straight to the target (no intro flap), so a `reset` with
 * text gives us a deterministic resting board with no ticking required.
 */

const board = (page: Page) => page.locator(".sf-board");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__flap !== "undefined");
});

async function snapAtRest(
  page: Page,
  seed: number,
  opts: {
    value?: string;
    lines?: string[];
    frame?: string[];
    rows?: number;
    cols?: number;
    theme?: string;
  }
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

test("frame border around the perimeter", async ({ page }) => {
  await snapAtRest(page, 3, {
    value: "PEACE",
    frame: ["#C8102E", "#FFFFFF", "#012169"],
  });
  await expect(board(page)).toHaveScreenshot("flag-border.png");
});

test("spotify explicit lines keep their cells inside a frame", async ({
  page,
}) => {
  await snapAtRest(page, 11, {
    lines: [
      "  listening",
      "give me ur love -",
      "another chemical",
      "love story",
      "another chemical",
      "  ",
    ],
    frame: ["#1db954", "#f5f5f5", "#191414"],
  });
  await expect(
    page.locator('.sf-cell[data-row="0"][data-col="2"]')
  ).toContainText("L");
  await expect(
    page.locator('.sf-cell[data-row="1"][data-col="3"]')
  ).toContainText("G");
  await expect(board(page)).toHaveScreenshot("spotify-lines-frame.png");
});

test("flipflap color chips ride the flaps with the drum grille below", async ({
  page,
}) => {
  await snapAtRest(page, 9, {
    value: "PEACE",
    frame: ["#C8102E", "#FFFFFF", "#012169"],
    theme: "flipflap",
  });
  const cellBox = await page.locator(".sf-cell").first().boundingBox();
  expect(cellBox).not.toBeNull();
  expect(cellBox!.height / cellBox!.width).toBeGreaterThan(1.8);
  expect(cellBox!.height / cellBox!.width).toBeLessThan(1.84);
  await expect(board(page)).toHaveCSS("--sf-grille-height", "18%");
  await expect(board(page)).toHaveScreenshot("flipflap-flag-border.png");
});

test("color chip cover waits until the flip has settled", async ({ page }) => {
  await snapAtRest(page, 10, { value: "", theme: "flipflap" });
  await page.evaluate(() => window.__flap.setMessage("", ["#FFFFFF"]));
  await page.waitForTimeout(150);

  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.__flap.tick(80));
    await page.waitForTimeout(20);
    if ((await page.locator(".sf-flip").count()) > 0) break;
  }

  expect(await page.locator(".sf-flip").count()).toBeGreaterThan(0);
  expect(await page.locator('.sf-cell[data-color-flap="true"]').count()).toBe(
    0
  );

  await page.waitForTimeout(300);
  expect(
    await page.locator('.sf-cell[data-color-flap="true"]').count()
  ).toBeGreaterThan(0);
});

test("color chips are the same width as text flaps", async ({ page }) => {
  await snapAtRest(page, 9, {
    value: "PEACE",
    frame: ["#C8102E", "#FFFFFF", "#012169"],
    theme: "flipflap",
  });

  // A colour chip is the same inset card as a glyph tile, not a wider full-bleed
  // block: its flap and settled cover sit in the same bezel inset as the text
  // flaps, so the two read at identical widths.
  const colorFlap = page
    .locator('.sf-cell[data-color-flap="true"] .sf-unit')
    .first();
  const textFlap = page
    .locator('.sf-cell:not([data-color-flap="true"]) .sf-unit')
    .first();
  const colorBox = await colorFlap.boundingBox();
  const textBox = await textFlap.boundingBox();
  expect(colorBox).not.toBeNull();
  expect(textBox).not.toBeNull();
  expect(Math.abs(colorBox!.width - textBox!.width)).toBeLessThan(0.5);
});

test("complex script renders shrunk-to-fit", async ({ page }) => {
  await snapAtRest(page, 4, { value: "నమస్తే" }); // Telugu "namaste"
  await expect(board(page)).toHaveScreenshot("complex-script.png");
});

test("dense Kannada clusters fit fixed-width cards", async ({ page }) => {
  await snapAtRest(page, 8, { value: "ನಮಸ್ಕಾರ ಪ್ರಪಂಚ" });
  await expect(board(page)).toHaveScreenshot("kannada-dense-clusters.png");
});

test("near-black frame stripe reads as a blank tile", async ({ page }) => {
  await snapAtRest(page, 5, { value: "DARK", frame: ["#050505", "#ff0000"] });
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
