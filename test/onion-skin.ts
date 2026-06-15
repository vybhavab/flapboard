import sharp from "sharp";

/**
 * Composite a sequence of board frames into one "onion-skin" image: the frames
 * laid on top of one another at rising opacity, so the diagonal cascade
 * wavefront — tiles that have already flipped to the new message vs those still
 * showing the old — is visible as ghost trails in a single still.
 *
 * Frames are oldest → newest. The oldest is the opaque base; each later frame is
 * blended over it at a uniform opacity that ramps toward the newest, which sits
 * most present on top. (Playwright PNGs carry their own alpha channel, so we
 * strip it and re-apply a flat alpha to get a true per-frame opacity.)
 */
export async function composeOnionSkin(
  frames: Buffer[],
  {
    minOpacity = 0.28,
    maxOpacity = 0.92,
  }: { minOpacity?: number; maxOpacity?: number } = {}
): Promise<Buffer> {
  if (frames.length === 0) throw new Error("composeOnionSkin: no frames");
  if (frames.length === 1) return frames[0];

  const overlays = [];
  for (let i = 1; i < frames.length; i++) {
    const opacity =
      minOpacity + (maxOpacity - minOpacity) * (i / (frames.length - 1));
    const layer = await sharp(frames[i])
      .removeAlpha()
      .ensureAlpha(opacity)
      .png()
      .toBuffer();
    overlays.push({ input: layer, blend: "over" as const });
  }

  return sharp(frames[0]).composite(overlays).png().toBuffer();
}
