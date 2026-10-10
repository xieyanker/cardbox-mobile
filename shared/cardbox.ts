import { z } from "zod";

export const CARD_STORAGE_KEY = "cardbox.cards.v1";
export const LOCK_TIMEOUT_KEY = "cardbox.lock.timeout.v1";
export const DEFAULT_LOCK_TIMEOUT = 60_000;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const CARD_TONES = [
  "#2F59C7",
  "#141820",
  "#F4C63D",
  "#287A6C",
  "#B84E4E",
  "#5368A5",
];
export const CARD_TYPES = {
  debit: "借记卡",
  credit: "信用卡",
  virtual: "虚拟卡",
} as const;

export const cardSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().max(120),
  number: z.string().max(64),
  cvv: z.string().max(8),
  expiry: z.string().max(16),
  note: z.string().max(5000),
  image: z.string().max(MAX_BACKUP_BYTES).optional(),
  tone: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  type: z.enum(["debit", "credit", "virtual"]).default("debit"),
});

export type Card = z.infer<typeof cardSchema>;
export const backupCardSchema = cardSchema.extend({
  imageData: z
    .string()
    .max(MAX_BACKUP_BYTES)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/)
    .optional(),
  imageMime: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
});
export type BackupCard = z.infer<typeof backupCardSchema>;

function uniqueIds(cards: { id: string }[]) {
  return new Set(cards.map((card) => card.id)).size === cards.length;
}

export const cardListSchema = z
  .array(cardSchema)
  .max(1000)
  .refine(uniqueIds, "卡片 ID 重复");
export const backupSchema = z.object({
  version: z.union([z.literal(2), z.literal(3)]),
  cards: z.array(backupCardSchema).max(1000).refine(uniqueIds, "卡片 ID 重复"),
});

export function parseCards(value: string): Card[] {
  return cardListSchema.parse(JSON.parse(value));
}

export function validateCardDraft(card: Card): string | null {
  if (!card.name.trim()) return "请输入卡片名称。";
  if (!/^\d{8,19}$/.test(card.number.replace(/\s/g, "")))
    return "卡号应为 8 至 19 位数字。";
  if (card.cvv && !/^\d{3,4}$/.test(card.cvv))
    return "CVV 应为 3 或 4 位数字，也可以留空。";
  if (card.expiry && !/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry))
    return "到期时间请使用 MM/YY 格式，例如 12/30。";
  if (!cardSchema.safeParse(card).success)
    return "卡片字段格式无效或内容过长。";
  return null;
}

export function moveCard(cards: Card[], id: string, direction: -1 | 1): Card[] {
  const index = cards.findIndex((card) => card.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= cards.length) return cards;
  const next = [...cards];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function parseLockTimeout(value: string | null): number {
  const number = Number(value);
  return value !== null && [0, 1, 60_000, 300_000].includes(number)
    ? number
    : DEFAULT_LOCK_TIMEOUT;
}

export function shouldLockAfterBackground(
  timeout: number,
  elapsed: number,
): boolean {
  return timeout !== 0 && (timeout === 1 || elapsed >= timeout);
}

export function lockTimeoutLabel(timeout: number): string {
  if (timeout === 0) return "不自动锁定";
  if (timeout === 1) return "立即锁定";
  return `${timeout / 60_000} 分钟后锁定`;
}
