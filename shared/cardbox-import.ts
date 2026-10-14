import { cardListSchema, type BackupCard, type Card } from "./cardbox";

export type ImportChoices = Record<string, "keep" | "replace">;
export type ImportConflict = {
  key: string;
  current: BackupCard;
  incoming: BackupCard;
  fromBackup: boolean;
  choice: "keep" | "replace";
};
type Entry = {
  card: BackupCard;
  source: "local" | "backup";
  targetId?: string;
};

/** Resolve in file order, including duplicates inside the same backup. No writes. */
export function planCardImport(
  existing: Card[],
  incoming: BackupCard[],
  choices: ImportChoices = {},
) {
  const entries: Entry[] = existing.map((card) => ({
    card,
    source: "local",
    targetId: card.id,
  }));
  const numbers = new Map<string, number>();
  const numberOf = (card: Card) => card.number.replace(/\s/g, "");
  entries.forEach((entry, index) => {
    if (!numbers.has(numberOf(entry.card)))
      numbers.set(numberOf(entry.card), index);
  });
  const conflicts: ImportConflict[] = [];
  let skipped = 0;
  for (const card of incoming) {
    const index = numbers.get(numberOf(card));
    if (index === undefined) {
      numbers.set(numberOf(card), entries.length);
      entries.push({ card, source: "backup" });
    } else {
      const current = entries[index];
      const choice = choices[card.id] === "replace" ? "replace" : "keep";
      conflicts.push({
        key: card.id,
        current: current.card,
        incoming: card,
        fromBackup: current.source === "backup",
        choice,
      });
      if (choice === "replace")
        entries[index] = { card, source: "backup", targetId: current.targetId };
      else skipped++;
    }
  }
  if (entries.length > 1000)
    throw new Error("合并后超过 1000 张卡片，请先整理卡包或选择替换方式。");
  const toImport = entries
    .filter((entry) => entry.source === "backup")
    .map((entry) => entry.card);
  return {
    entries,
    conflicts,
    toImport,
    added: entries.length - existing.length,
    updated: entries.filter(
      (entry) => entry.source === "backup" && entry.targetId,
    ).length,
    skipped,
  };
}
export type ImportPlan = ReturnType<typeof planCardImport>;

/** Replaced local cards retain their IDs, order and favorite references. */
export function materializeImport(
  plan: ImportPlan,
  restored: Card[],
  newId: () => string,
) {
  const restoredById = new Map(restored.map((card) => [card.id, card]));
  const used = new Set(
    plan.entries.flatMap((entry) => (entry.targetId ? [entry.targetId] : [])),
  );
  const cards = plan.entries.map((entry) => {
    if (entry.source === "local") return entry.card;
    const card = restoredById.get(entry.card.id);
    if (!card) throw new Error("导入内容不完整，请重新选择备份。");
    if (entry.targetId) return { ...card, id: entry.targetId };
    let id = card.id;
    for (let tries = 0; used.has(id); tries++) {
      if (tries >= 10) throw new Error("无法分配卡片标识，请重试。");
      id = newId();
    }
    used.add(id);
    return { ...card, id };
  });
  return cardListSchema.parse(cards);
}
