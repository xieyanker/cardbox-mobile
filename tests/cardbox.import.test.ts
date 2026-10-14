import { describe, it, expect } from "vitest";
import { planCardImport, materializeImport } from "../shared/cardbox-import";
import {
  parseCards,
  backupSchema,
  validateCardDraft,
  type Card,
} from "../shared/cardbox";
const card: Card = {
  id: "local",
  name: "旧卡",
  number: "1234567890123456",
  cvv: "123",
  expiry: "12/30",
  note: "",
  tone: "#2F59C7",
  type: "credit",
};
describe("import conflict decisions", () => {
  it("defaults to keep for legacy IDs matching object property names", () => {
    for (const id of ["constructor", "__proto__", "toString"]) {
      const plan = planCardImport([card], [{ ...card, id }]);
      expect(plan.conflicts[0].choice).toBe("keep");
      expect(plan.toImport).toEqual([]);
    }
  });
  it("defaults to preserving existing content and only imports new images", () => {
    const incoming = [
      { ...card, id: "backup", note: "新资料", imageData: "aW1hZ2U=" },
      { ...card, id: "new", number: "2345678901234567" },
    ];
    const plan = planCardImport([card], incoming);
    expect(plan).toMatchObject({ added: 1, updated: 0, skipped: 1 });
    expect(plan.toImport.map((c) => c.id)).toEqual(["new"]);
    expect(
      materializeImport(plan, plan.toImport, () => "generated")[0],
    ).toEqual(card);
  });
  it("replaces full content while retaining local identity and position", () => {
    const other = { ...card, id: "other", number: "2345678901234567" };
    const imported = {
      ...card,
      id: "backup",
      name: "新卡",
      billingDay: "5",
      repaymentDay: "25",
      image: "file:///new.jpg",
    };
    const plan = planCardImport([other, card], [imported], {
      backup: "replace",
    });
    const result = materializeImport(plan, [imported], () => "generated");
    expect(plan.updated).toBe(1);
    expect(result).toEqual([other, { ...imported, id: "local" }]);
    expect(card.name).toBe("旧卡");
  });
  it("resolves duplicates inside backups in order and restores only the final image", () => {
    const first = { ...card, id: "first", note: "first" };
    const last = { ...card, id: "last", note: "last" };
    const plan = planCardImport([], [first, last], { last: "replace" });
    expect(plan.conflicts[0].fromBackup).toBe(true);
    expect(plan.toImport).toEqual([last]);
    expect(materializeImport(plan, [last], () => "generated")).toEqual([last]);
  });
  it("preserves other intentional local duplicates and remaps unrelated ID collisions", () => {
    const duplicate = { ...card, id: "local2" };
    const incoming = { ...card, number: "3456789012345678" };
    const plan = planCardImport([card, duplicate], [incoming]);
    expect(
      materializeImport(plan, [incoming], () => "generated").map((c) => c.id),
    ).toEqual(["local", "local2", "generated"]);
  });
  it("enforces final capacity and fails without partial results when restored data is missing", () => {
    const existing = Array.from({ length: 1000 }, (_, i) => ({
      ...card,
      id: `c${i}`,
      number: String(10000000 + i),
    }));
    expect(() => planCardImport(existing, [card])).toThrow("1000");
    const plan = planCardImport([], [card]);
    expect(() => materializeImport(plan, [], () => "new")).toThrow("不完整");
  });
});
describe("optional credit card dates and compatibility", () => {
  it("reads legacy cards without inserting or rewriting new fields", () => {
    expect(parseCards(JSON.stringify([card]))).toEqual([card]);
    expect(backupSchema.parse({ version: 2, cards: [card] }).cards).toEqual([
      card,
    ]);
  });
  it("preserves dates through backups and permits independent empty dates", () => {
    for (const [billingDay, repaymentDay] of [
      ["1", "31"],
      ["", "25"],
      ["05", ""],
    ]) {
      const next = { ...card, billingDay, repaymentDay };
      expect(validateCardDraft(next)).toBeNull();
      expect(
        backupSchema.parse({ version: 3, cards: [next] }).cards[0],
      ).toEqual(next);
    }
  });
  it("rejects invalid dates without trying to schedule or infer month lengths", () => {
    for (const day of ["0", "32", "-1", "1.5", "日", " 5"]) {
      expect(validateCardDraft({ ...card, billingDay: day })).toContain(
        "账单日",
      );
      expect(validateCardDraft({ ...card, repaymentDay: day })).toContain(
        "还款日",
      );
    }
  });
});
