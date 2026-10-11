import { describe, expect, it } from "vitest";
import { editExpiryInput, expiryInputMask } from "../shared/cardbox-expiry";
import {
  cardListSchema,
  validateCardDraft,
  type Card,
} from "../shared/cardbox";

const selection = (start: number, end = start) => ({ start, end });

describe("expiry single-input mask", () => {
  it("shows a fixed slash and four slots, including on existing cards", () => {
    expect(expiryInputMask("")).toBe("__/__");
    expect(expiryInputMask("0")).toBe("0_/__");
    expect(expiryInputMask("07")).toBe("07/__");
    expect(expiryInputMask("07/2")).toBe("07/2_");
    expect(expiryInputMask("07/26")).toBe("07/26");
  });

  it("types four digits consecutively, skipping the slash", () => {
    let value = "";
    let cursor = selection(0);
    for (const [digit, expected, position] of [
      ["0", "0", 1],
      ["7", "07", 3],
      ["2", "07/2", 4],
      ["6", "07/26", 5],
    ] as const) {
      const mask = expiryInputMask(value);
      const edit = editExpiryInput(
        value,
        mask.slice(0, cursor.start) + digit + mask.slice(cursor.end),
        cursor,
      );
      expect(edit).toEqual({ value: expected, selection: selection(position) });
      value = edit.value;
      cursor = edit.selection;
    }
  });

  it("backspaces all the way to empty without getting stuck on the slash", () => {
    let value = "07/26";
    let cursor = selection(5);
    for (const expected of ["07/2", "07", "0", ""]) {
      const mask = expiryInputMask(value);
      const edit = editExpiryInput(
        value,
        mask.slice(0, cursor.start - 1) + mask.slice(cursor.start),
        cursor,
      );
      expect(edit.value).toBe(expected);
      value = edit.value;
      cursor = edit.selection;
    }
    expect(expiryInputMask(value)).toBe("__/__");
  });

  it("pastes digits or the old format, discards non-digits and limits to four digits", () => {
    for (const text of ["0726", "07/26", " 07 / 26 ", "072699"]) {
      expect(editExpiryInput("", text, selection(0, 5)).value).toBe("07/26");
    }
    expect(editExpiryInput("07/26", "", selection(0, 5)).value).toBe("");
    expect(editExpiryInput("", "a__/__", selection(0)).value).toBe("");
  });

  it("edits selected months and years and retains the correct caret with repeated digits", () => {
    expect(editExpiryInput("07/26", "12/26", selection(0, 2))).toEqual({
      value: "12/26",
      selection: selection(3),
    });
    expect(editExpiryInput("07/26", "07/30", selection(3, 5))).toEqual({
      value: "07/30",
      selection: selection(5),
    });
    expect(editExpiryInput("07/22", "07/222", selection(3))).toEqual({
      value: "07/22",
      selection: selection(4),
    });
    expect(editExpiryInput("07/22", "07/2", selection(4))).toEqual({
      value: "07/2",
      selection: selection(3),
    });
    expect(editExpiryInput("07/26", "0726", selection(2))).toEqual({
      value: "07/6",
      selection: selection(3),
    });
  });

  it("keeps old persisted strings intact and continues validating month and completeness", () => {
    const card: Card = {
      id: "legacy",
      name: "旧卡片",
      number: "1234567890123456",
      cvv: "",
      expiry: "07/26",
      note: "",
      tone: "#2F59C7",
      type: "debit",
    };
    for (const expiry of ["", "07/26", "12/30", "legacy text"]) {
      expect(cardListSchema.parse([{ ...card, expiry }])[0].expiry).toBe(
        expiry,
      );
    }
    expect(validateCardDraft(card)).toBeNull();
    expect(validateCardDraft({ ...card, expiry: "" })).toBeNull();
    for (const expiry of ["00/26", "13/26", "07", "07/2", "__/__"]) {
      expect(validateCardDraft({ ...card, expiry })).not.toBeNull();
    }
  });
});
