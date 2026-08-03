import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

/**
 * Renders every app icon from one source geometry, so the favicon, the PWA icons and the mark in
 * the UI can never drift apart. Run with `pnpm icons:generate` after changing the geometry here or
 * in src/features/ui-kit/logo-mark.tsx — the two must be kept in sync by hand.
 */

const BRAND = "#176b45";
const TILE = "#ffffff";
const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * A heavy geometric M, drawn as one filled path. It carries its own margins inside the 512 box, so
 * at scale 1 it sits with a comfortable border on every tile. Kept in sync by hand with
 * src/features/ui-kit/logo-mark.tsx.
 */
const MARK = "M70 400V112h106l80 156 80-156h106v288h-76V236l-80 136h-60l-80-136v164z";

/**
 * @param scale share of the tile the mark occupies; maskable icons need a wide safe zone because
 *   Android crops them to an arbitrary shape.
 * @param radius corner radius in source units, or 0 for the full-bleed tiles the platform masks itself.
 */
function tile({ scale, radius }: { scale: number; radius: number }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${TILE}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><path d="${MARK}" fill="${BRAND}"/></g>
</svg>`;
}

const targets = [
  { file: "public/icons/icon-192.png", size: 192, svg: tile({ scale: 1, radius: 120 }) },
  { file: "public/icons/icon-512.png", size: 512, svg: tile({ scale: 1, radius: 120 }) },
  { file: "public/icons/maskable-512.png", size: 512, svg: tile({ scale: 0.72, radius: 0 }) },
  { file: "src/app/apple-icon.png", size: 180, svg: tile({ scale: 0.92, radius: 0 }) },
];

async function main() {
  for (const target of targets) {
    const absolute = path.join(ROOT, target.file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await sharp(Buffer.from(target.svg)).resize(target.size, target.size).png().toFile(absolute);
    process.stdout.write(`${target.file} — ${target.size}×${target.size}\n`);
  }

  // The favicon stays vector so browsers rasterise it themselves at whatever size they need.
  const favicon = path.join(ROOT, "src/app/icon.svg");
  await writeFile(favicon, `${tile({ scale: 1, radius: 120 })}\n`, "utf8");
  process.stdout.write("src/app/icon.svg — vector\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
