import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSE_ORDER,
  parseBrowseOrder,
} from "../shared/cardbox-browse";

describe("browse order preferences", () => {
  it("uses classic, wallet, stack, focus by default", () => {
    expect(parseBrowseOrder(null)).toEqual([
      "classic",
      "wallet",
      "stack",
      "focus",
    ]);
  });
  it("preserves a complete user-defined permutation", () => {
    const order = ["wallet", "focus", "classic", "stack"];
    expect(parseBrowseOrder(JSON.stringify(order))).toEqual(order);
  });
  it.each([
    "bad json",
    "{}",
    '["classic","classic","stack","focus"]',
    '["classic"]',
    '["classic","wallet","stack","unknown"]',
  ])("recovers incomplete or damaged preferences: %s", (value) => {
    expect(parseBrowseOrder(value)).toEqual(DEFAULT_BROWSE_ORDER);
  });
});
