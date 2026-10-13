// Export approved artwork with one shared production matte for all platforms.
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { getPngInfo } = require("@expo/image-utils");
async function main() {
  const root = path.dirname(require.resolve("../package.json"));
  const artwork = await fs.readFile(
    path.join(root, "assets/branding/cardbox-approved-artwork.png"),
  );
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const outputs = await page.evaluate(async (input) => {
      const image = new Image();
      image.src = `data:image/png;base64,${input}`;
      await image.decode();
      // Smooth silhouette masks preserve the ivory card and avoid alpha halos.
      const cards = [
        "M273 750 L273 396 Q273 346 322 323 L1038 147 Q1101 127 1131 181 Q1142 200 1142 224 L1142 280 L435 455 Q368 478 366 540 L366 817 Q312 839 284 796 Q273 779 273 750 Z",
        "M389 875 L389 547 Q389 484 451 463 L1139 299 Q1204 278 1227 332 Q1233 348 1233 371 L1233 425 L570 588 Q481 609 481 681 L481 941 Q421 957 399 918 Q389 899 389 875 Z",
        "M498 951 L498 684 Q498 621 559 601 L1209 436 Q1275 414 1305 466 Q1317 486 1317 512 L1317 827 Q1317 871 1270 892 L579 1030 Q527 1050 505 1001 Q498 981 498 951 Z",
      ];
      const marks = [
        "M364 377 Q364 363 379 359 L504 329 Q522 323 522 341 L522 394 Q522 409 507 413 L380 444 Q364 449 364 432 Z",
        "M468 534 Q468 518 482 514 L605 484 Q623 479 623 497 L623 550 Q623 565 608 569 L484 599 Q468 604 468 587 Z",
        "M560 670 Q560 654 575 649 L710 618 Q728 613 728 631 L728 687 Q728 702 713 706 L576 739 Q560 743 560 726 Z",
      ];
      function canvas(w, h) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      }
      const matte = canvas(1397, 1125),
        ctx = matte.getContext("2d");
      const silhouette = new Path2D(cards.join(" "));
      ctx.save();
      ctx.clip(silhouette);
      ctx.drawImage(image, 0, 0, 1397, 1125);
      ctx.restore();
      // Remove cool near-white canvas remnants at the production matte edge;
      // the warm ivory card is retained, including its darker lower contour.
      const pixels = ctx.getImageData(0, 0, 1397, 1125);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const [r, g, b] = pixels.data.subarray(i, i + 3);
        if (r > 235 && g >= r + 2 && b >= r + 2) pixels.data[i + 3] = 0;
      }
      ctx.putImageData(pixels, 0, 0);
      const mono = canvas(1397, 1125),
        mc = mono.getContext("2d");
      mc.fillStyle = "#000";
      mc.fill(silhouette);
      mc.globalCompositeOperation = "destination-out";
      for (const d of marks) mc.fill(new Path2D(d));
      function render(source, size, symbolWidth, background) {
        const c = canvas(size, size),
          dc = c.getContext("2d");
        if (background) {
          dc.fillStyle = background;
          dc.fillRect(0, 0, size, size);
        }
        const height = (symbolWidth * 898) / 1048;
        dc.drawImage(
          source,
          271,
          140,
          1048,
          898,
          (size - symbolWidth) / 2,
          (size - height) / 2,
          symbolWidth,
          height,
        );
        return c.toDataURL("image/png").split(",")[1];
      }
      const bg = canvas(1024, 1024),
        bc = bg.getContext("2d");
      bc.fillStyle = "#F2F6F5";
      bc.fillRect(0, 0, 1024, 1024);
      return {
        "branding/cardbox-brand-source.png": render(matte, 1024, 780),
        "branding/cardbox-icon-source.png": render(matte, 1024, 780, "#F2F6F5"),
        "branding/cardbox-monochrome-source.png": render(mono, 1024, 780),
        "images/icon.png": render(matte, 1024, 780, "#F2F6F5"),
        "images/favicon.png": render(matte, 256, 195, "#F2F6F5"),
        "images/splash-icon.png": render(matte, 1024, 780),
        "images/android-icon-foreground.png": render(matte, 1024, 570),
        "images/android-icon-monochrome.png": render(mono, 1024, 570),
        "images/android-icon-background.png": bg
          .toDataURL("image/png")
          .split(",")[1],
      };
    }, artwork.toString("base64"));
    for (const [name, data] of Object.entries(outputs)) {
      const file = path.join(root, "assets", name);
      await fs.writeFile(file, Buffer.from(data, "base64"));
      const png = await getPngInfo(file);
      const opaque = [
        "branding/cardbox-icon-source.png",
        "images/icon.png",
        "images/favicon.png",
        "images/android-icon-background.png",
      ].includes(name);
      let visible = 0;
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++) {
          const i = (y * png.width + x) * 4;
          if (opaque)
            assert.equal(png.data[i + 3], 255, `${name} must be opaque`);
          if (png.data[i + 3] > 10) {
            visible++;
            if (
              name.includes("foreground") ||
              name === "images/android-icon-monochrome.png"
            )
              assert(
                Math.hypot(x - 511.5, y - 511.5) < 338,
                `${name} exceeds adaptive safe circle`,
              );
          }
        }
      assert(visible > 0);
      console.log(name, `${png.width}x${png.height}`, "validated");
    }
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
