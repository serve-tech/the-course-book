import { IMAGE_FONTS, imageScale, layoutRankingImage, type DrawOp, type RankingImageContent } from "./ranking-image";

/**
 * Draws the tall ranking image on a canvas. The layout rules live in
 * `ranking-image.ts`; this module is the browser boundary. The browser suite
 * covers it, because jsdom has no canvas.
 */

/** Wait for the image's fonts. A failure only means a fallback font, so it is logged, not raised. */
async function loadFonts(): Promise<void> {
  try {
    await Promise.all(IMAGE_FONTS.map((font) => document.fonts.load(font)));
  } catch (error) {
    console.warn("Ranking image fonts unavailable; using fallback fonts", error);
  }
}

function draw(context: CanvasRenderingContext2D, op: DrawOp): void {
  if (op.kind === "rule") {
    context.fillStyle = op.color;
    context.fillRect(op.x, op.y, op.width, 1);
    return;
  }
  context.font = op.font;
  context.fillStyle = op.color;
  context.textAlign = op.align;
  context.fillText(op.text, op.x, op.y);
}

/**
 * Render the image as a PNG.
 *
 * Args:
 *     content: What the image says.
 *
 * Returns:
 *     The PNG.
 *
 * Raises:
 *     Error: When the browser has no 2D canvas, or could not draw an image
 *         this size. Browsers report an oversized canvas by leaving it blank
 *         rather than by throwing, so the first pixel is checked.
 */
export async function renderRankingImage(content: RankingImageContent): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw the image.");
  const layout = layoutRankingImage(content, (text, font) => {
    context.font = font;
    return context.measureText(text).width;
  });
  const scale = imageScale(layout.width, layout.height);
  // Setting a canvas's size resets its drawing state, so the scale comes after.
  canvas.width = Math.ceil(layout.width * scale);
  canvas.height = Math.ceil(layout.height * scale);
  context.scale(scale, scale);
  context.fillStyle = layout.background;
  context.fillRect(0, 0, layout.width, layout.height);
  context.textBaseline = "alphabetic";
  for (const op of layout.ops) draw(context, op);
  if (context.getImageData(0, 0, 1, 1).data[3] !== 255) throw new Error("This ranking is too long for this browser to draw.");
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser couldn't save the image."));
    }, "image/png");
  });
}
