export function cardTextColor(tone: string): string {
  const rgb = [1, 3, 5].map((offset) => {
    const value = parseInt(tone.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return 1.05 / (luminance + 0.05) >= 4.5 ? "#FFFFFF" : "#141820";
}
