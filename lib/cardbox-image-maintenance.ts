import * as FileSystem from "expo-file-system/legacy";
import { cleanupOwnedImages } from "./cardbox-files";
import type { Card } from "../shared/cardbox";

export async function discardOwnedImage(uri: string) {
  const directory =
    FileSystem.documentDirectory &&
    `${FileSystem.documentDirectory}cardbox-images/`;
  if (directory && uri.startsWith(directory))
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
      () => undefined,
    );
}

/** Retain restore-point references even after successful replacements and deletions. */
export async function cleanupPreviousImages(
  storage: { readRestorePoint: () => Promise<{ cards: Card[] } | null> },
  previous: Card[],
  next: Card[],
  notify: (title: string, description: string) => void,
) {
  try {
    const point = await storage.readRestorePoint();
    await cleanupOwnedImages(previous, [...next, ...(point?.cards ?? [])]);
  } catch {
    notify("数据已保存", "旧图片暂未清理，恢复点与卡包已保留，请稍后重试。");
  }
}
