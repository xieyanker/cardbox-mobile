import CryptoJS from "crypto-js";
import { z } from "zod";
import type { Card } from "../shared/cardbox";
export const BACKUP_RECORD_KEY = "cardbox.backup-record.v1";
export const backupRecordSchema = z.object({
  at: z.string().datetime(),
  includeImages: z.boolean().default(true),
  cards: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
});
export type BackupRecord = z.infer<typeof backupRecordSchema>;
export function createBackupRecord(
  cards: Card[],
  at = new Date().toISOString(),
  includeImages = true,
): BackupRecord {
  return {
    at,
    includeImages,
    cards: Object.fromEntries(
      cards.map((card) => [
        card.id,
        CryptoJS.SHA256(JSON.stringify(card)).toString(),
      ]),
    ),
  };
}
export function backupChanges(cards: Card[], record: BackupRecord | null) {
  if (!record) return { changed: cards.length, removed: 0 };
  const current = createBackupRecord(cards).cards;
  return {
    changed: cards.filter((card) => current[card.id] !== record.cards[card.id])
      .length,
    removed: Object.keys(record.cards).filter(
      (id) => !Object.hasOwn(current, id),
    ).length,
  };
}
