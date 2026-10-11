// Export generated brand artwork at the sizes used by Expo; no design changes.
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  compositeImagesAsync,
  generateImageAsync,
  generateImageBackgroundAsync,
  getPngInfo,
} = require("@expo/image-utils");

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const source = (name) => path.join(projectRoot, "assets/branding", name);
  const output = (name) => path.join(projectRoot, "assets/images", name);
  const exports = [
    ["cardbox-icon-source.png", "icon.png", 1024],
    ["cardbox-brand-source.png", "android-icon-foreground.png", 768, 1024],
    ["cardbox-monochrome-source.png", "android-icon-monochrome.png", 768, 1024],
    ["cardbox-brand-source.png", "splash-icon.png", 1024],
    ["cardbox-icon-source.png", "favicon.png", 256],
  ];
  for (const [input, name, size, canvasSize] of exports) {
    let { source: buffer } = await generateImageAsync(
      { projectRoot },
      {
        src: source(input),
        width: size,
        height: size,
        resizeMode: "contain",
      },
    );
    if (canvasSize) {
      // Android's safe circle has a 66% diameter; retain the entire wordmark in that circle.
      buffer = await compositeImagesAsync({
        foreground: buffer,
        background: await generateImageBackgroundAsync({
          width: canvasSize,
          height: canvasSize,
          resizeMode: "contain",
          backgroundColor: "#00000000",
        }),
        x: (canvasSize - size) / 2,
        y: (canvasSize - size) / 2,
      });
    }
    await fs.writeFile(output(name), buffer);
  }
  await fs.writeFile(
    output("android-icon-background.png"),
    await generateImageBackgroundAsync({
      width: 1024,
      height: 1024,
      resizeMode: "contain",
      backgroundColor: "#F2F6F5",
    }),
  );
  for (const name of [
    ...exports.map((entry) => entry[1]),
    "android-icon-background.png",
  ]) {
    const { width, height, data } = await getPngInfo(output(name));
    let transparent = 0,
      opaque = 0;
    for (let offset = 3; offset < data.length; offset += 4) {
      if (data[offset] === 0) transparent++;
      if (data[offset] === 255) opaque++;
    }
    console.log(name, `${width}x${height}`, { transparent, opaque });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
