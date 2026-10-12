import { useState } from "react";
import { imageInventory, removeUnusedImages } from "../lib/cardbox-files";
import type { useCardboxCards } from "./use-cardbox-cards";
import type { CardboxOperations } from "./use-cardbox-operations";
import type { Card } from "../shared/cardbox";
export function useCardboxStorageManagement(
  storage: ReturnType<typeof useCardboxCards>,
  operations: CardboxOperations,
  draft: Card | null,
) {
  const { ensureAccessible, askConfirmation } = operations;
  const [inventory, setInventory] = useState<{
    bytes: number;
    files: number;
    unused: string[];
  } | null>(null);
  async function loadInventory(clean = false) {
    ensureAccessible();
    const point = await storage.readRestorePoint();
    const references = [...(await storage.read()), ...(point?.cards ?? [])].map(
      (card) => card.image,
    );
    if (draft?.image) references.push(draft.image);
    if (clean) {
      if (
        !(await askConfirmation(
          "清理无用卡面",
          "仅删除没有被当前卡包或导入恢复点引用的应用自有图片，是否继续？",
        ))
      )
        return;
      ensureAccessible();
      await removeUnusedImages(references);
    }
    setInventory(await imageInventory(references));
  }

  return { inventory, loadInventory };
}
