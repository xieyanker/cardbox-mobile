import { describe, expect, it } from "vitest";
import {
  backupSchema,
  cardListSchema,
  DEFAULT_LOCK_TIMEOUT,
  moveCard,
  parseLockTimeout,
  validateCardDraft,
  type Card,
} from "../shared/cardbox";

const card: Card = {
  id: "one",
  name: "测试卡",
  number: "1234567890123456",
  cvv: "123",
  expiry: "12/30",
  note: "",
  tone: "#2F59C7",
  type: "debit",
};

describe("card and backup validation", () => {
  it("moves by identity after preceding moves change indexes", () => {
    const original = ["one", "two", "three"].map((id) => ({ ...card, id }));
    const first = moveCard(original, "one", 1);
    expect(moveCard(first, "one", 1).map((item) => item.id)).toEqual([
      "two",
      "three",
      "one",
    ]);
    expect(original.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(moveCard(original, "one", -1)).toBe(original);
    expect(moveCard(original, "missing", 1)).toBe(original);
  });

  it("reads old cards without a type and rejects duplicate identities", () => {
    const { type: _type, ...legacy } = card;
    expect(cardListSchema.parse([legacy])[0].type).toBe("debit");
    expect(cardListSchema.safeParse([card, card]).success).toBe(false);
  });

  it("rejects unsupported backup versions and malformed card data", () => {
    expect(backupSchema.safeParse({ version: 4, cards: [card] }).success).toBe(
      false,
    );
    expect(
      backupSchema.safeParse({ version: 3, cards: [{ ...card, tone: "red" }] })
        .success,
    ).toBe(false);
    expect(
      backupSchema.safeParse({
        version: 3,
        cards: [{ ...card, imageData: "../image" }],
      }).success,
    ).toBe(false);
  });

  it("validates editable numbers, CVV and month rather than accepting arbitrary text", () => {
    expect(
      validateCardDraft({ ...card, number: "1234 5678 9012 3456" }),
    ).toBeNull();
    expect(validateCardDraft({ ...card, cvv: "", expiry: "" })).toBeNull();
    expect(validateCardDraft({ ...card, name: "   " })).not.toBeNull();
    expect(validateCardDraft({ ...card, number: "1234abcd" })).not.toBeNull();
    expect(validateCardDraft({ ...card, cvv: "12" })).not.toBeNull();
    expect(validateCardDraft({ ...card, expiry: "13/30" })).not.toBeNull();
  });

  it("uses a safe default for invalid saved lock timeouts", () => {
    for (const value of [null, "-1", "invalid", "60001"])
      expect(parseLockTimeout(value)).toBe(DEFAULT_LOCK_TIMEOUT);
    for (const value of ["0", "1", "60000", "300000"])
      expect(parseLockTimeout(value)).toBe(Number(value));
  });
});
