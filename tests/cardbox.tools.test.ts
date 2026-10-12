import { describe, expect, it, vi } from "vitest";
import {
  filterCards,
  expiryStatus,
  mergeCards,
  moveCardTo,
} from "../shared/cardbox-tools";
import { createPreferenceRepository } from "../lib/cardbox-preferences";
import type { Card } from "../shared/cardbox";
import { cropGeometry } from "../shared/cardbox-crop";
import {
  backupChanges,
  createBackupRecord,
} from "../lib/cardbox-backup-record";
const card: Card = {
  id: "one",
  name: "招商卡",
  number: "1234567890123456",
  cvv: "",
  expiry: "07/26",
  note: "",
  tone: "#F4C63D",
  type: "debit",
};
describe("card tools and new independent preferences", () => {
  it("bounds crop geometry while zooming and moving past the image edges", () => {
    for (const [width, height] of [
      [400, 1000],
      [2000, 300],
    ]) {
      for (const zoom of [1, 2, 4]) {
        for (const center of [0, 0.5, 1]) {
          const crop = cropGeometry(width, height, zoom, center, center);
          expect(crop.originX).toBeGreaterThanOrEqual(0);
          expect(crop.originY).toBeGreaterThanOrEqual(0);
          expect(crop.originX + crop.width).toBeLessThanOrEqual(width);
          expect(crop.originY + crop.height).toBeLessThanOrEqual(height);
        }
      }
    }
  });
  it("counts changes and removals relative to the successful export snapshot", () => {
    const record = createBackupRecord([card, { ...card, id: "two" }]);
    expect(backupChanges([card, { ...card, id: "three" }], record)).toEqual({
      changed: 1,
      removed: 1,
    });
    expect(backupChanges([{ ...card, note: "new" }], record)).toEqual({
      changed: 1,
      removed: 1,
    });
    expect(JSON.stringify(record)).not.toContain(card.number);
  });
  it("searches hidden suffixes and names, filters types and pins favorites without changing card order", () => {
    const cards = [
      card,
      { ...card, id: "two", name: "信用卡", type: "credit" as const },
    ];
    expect(
      filterCards(cards, "3456", "all", ["two"], false).map((c) => c.id),
    ).toEqual(["two", "one"]);
    expect(filterCards(cards, "招商", "credit", [], false)).toEqual([]);
    expect(
      filterCards(cards, "", "all", ["two"], true).map((c) => c.id),
    ).toEqual(["two"]);
    expect(cards[0].id).toBe("one");
  });
  it("uses month end and supports expired cards without changing their values", () => {
    expect(expiryStatus("07/26", new Date(2026, 6, 31))).toBe("即将到期");
    expect(expiryStatus("07/26", new Date(2026, 7, 1))).toBe("已到期");
    expect(expiryStatus("12/30", new Date(2026, 7, 1))).toBe("");
    expect(expiryStatus("legacy text")).toBe("");
  });
  it("moves a card to a bounded drop target without mutating the original", () => {
    const cards = [card, { ...card, id: "two" }, { ...card, id: "three" }];
    expect(moveCardTo(cards, "one", 2).map((c) => c.id)).toEqual([
      "two",
      "three",
      "one",
    ]);
    expect(cards[0].id).toBe("one");
  });
  it("merges without overwriting existing numbers and remaps conflicting identities", () => {
    const result = mergeCards(
      [card],
      [
        { ...card, id: "other" },
        { ...card, number: "2345678901234567", note: "导入" },
      ],
      () => "new-id",
    );
    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(result.cards[0]).toEqual(card);
    expect(result.cards[1].id).toBe("new-id");
  });
  it("serializes preference writes and preserves saved settings when a write fails", async () => {
    let raw: string | null = null;
    const setItem = vi.fn(async (_key: string, value: string) => {
      raw = value;
    });
    const repo = createPreferenceRepository({
      getItem: async () => raw,
      setItem,
    });
    await Promise.all([
      repo.update((value) => ({ ...value, favorites: ["one"] })),
      repo.update((value) => ({ ...value, lastSelectedId: "two" })),
    ]);
    setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      repo.update((value) => ({ ...value, favorites: [] })),
    ).rejects.toThrow("disk full");
    const saved = await repo.update((value) => ({
      ...value,
      privateImages: true,
    }));
    expect(saved).toEqual({
      favorites: ["one"],
      lastSelectedId: "two",
      privateImages: true,
    });
    expect(await repo.load()).toEqual(saved);
  });
  it("does not overwrite unreadable preference data", async () => {
    const setItem = vi.fn();
    const repo = createPreferenceRepository({
      getItem: async () => "broken",
      setItem,
    });
    await expect(repo.update((value) => value)).rejects.toThrow();
    expect(setItem).not.toHaveBeenCalled();
  });
});
