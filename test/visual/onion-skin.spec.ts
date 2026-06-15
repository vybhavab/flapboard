import { test, expect, type Page } from "@playwright/test";

import { composeOnionSkin } from "../onion-skin";

/**
 * The "images laid on top of one another" evidence: drive one deterministic
 * transition frame by frame, screenshot each cascade step (folds retired,
 * animations frozen, so each frame shows landed faces), then composite them into
 * a single onion-skin still. The result is both attached to the report (visual
 * evidence) and snapshot-compared (regression guard).
 */

const board = (page: Page) => page.locator(".sf-board");

test("cascade onion-skin", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.__flap !== "undefined");

  // Start from a resting board, then kick off a full-board change.
  await page.evaluate(() => window.__flap.reset(7, { value: "WAITING" }));
  await board(page).waitFor({ state: "visible" });
  await page.waitForTimeout(150);
  const frames: Buffer[] = [
    await board(page).screenshot({ animations: "disabled" }),
  ];

  await page.evaluate(() =>
    window.__flap.setMessage("DEPARTURES NOW", ["#C8102E", "#FFD700"])
  );
  await page.waitForTimeout(150); // let the retarget effect schedule the first frame

  // Advance the engine clock in fixed chunks; after each, wait for the React
  // render + fold retire, then capture the landed-faces frame.
  for (let i = 0; i < 16; i++) {
    const pending = await page.evaluate(() => {
      window.__flap.tick(260);
      return window.__flap.pendingFrames();
    });
    await page.waitForTimeout(240);
    frames.push(await board(page).screenshot({ animations: "disabled" }));
    if (pending === 0) break;
  }

  expect(frames.length).toBeGreaterThan(3); // we actually captured a cascade

  const onion = await composeOnionSkin(frames);
  await testInfo.attach("onion-skin", {
    body: onion,
    contentType: "image/png",
  });

  expect(onion).toMatchSnapshot("cascade-onion-skin.png");
});
