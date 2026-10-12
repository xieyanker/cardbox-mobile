export const CARD_RATIO = 1.586;
export type CropSource = { uri: string; width: number; height: number };
export function cropGeometry(
  width: number,
  height: number,
  zoom: number,
  x: number,
  y: number,
) {
  const cropWidth = Math.max(
    1,
    Math.min(
      width,
      Math.round(Math.min(width, height * CARD_RATIO) / Math.max(1, zoom)),
    ),
  );
  const cropHeight = Math.max(
    1,
    Math.min(height, Math.round(cropWidth / CARD_RATIO)),
  );
  return {
    width: cropWidth,
    height: cropHeight,
    originX: Math.max(
      0,
      Math.min(width - cropWidth, Math.round(width * x - cropWidth / 2)),
    ),
    originY: Math.max(
      0,
      Math.min(height - cropHeight, Math.round(height * y - cropHeight / 2)),
    ),
  };
}
