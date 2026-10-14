import { describe, it, expect } from "vitest";
import { assertBackupCapacity, utf8Bytes } from "../shared/cardbox-backup-size";
describe("backup size budget", () => {
  it("counts Chinese, emoji and escaped JSON using UTF-8 byte lengths", () => {
    for (const value of [
      "ascii",
      "卡片🙂",
      JSON.stringify({ note: "\u0000\n中文", value: "\ud800" }),
    ])
      expect(utf8Bytes(value)).toBe(Buffer.byteLength(value));
  });
  it("reserves AES padding, base64 expansion and envelope overhead", () => {
    expect(() => assertBackupCapacity(1024)).not.toThrow();
    expect(() => assertBackupCapacity(40 * 1024 * 1024)).toThrow("50 MB");
  });
});
