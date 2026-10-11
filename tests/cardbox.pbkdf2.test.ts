import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { derivePasswordBytes } from "../lib/cardbox-pbkdf2";

describe("backup password derivation", () => {
  it.each([1, 2, 257, 1000])(
    "matches independent SHA-256 PBKDF2 vectors at %i iterations",
    async (iterations) => {
      const password = Buffer.from("密码🔐 / test", "utf8");
      const salt = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
      for (const length of [32, 48, 64]) {
        const expected = pbkdf2Sync(
          password,
          salt,
          iterations,
          length,
          "sha256",
        );
        expect(
          Buffer.from(
            await derivePasswordBytes(password, salt, iterations, length),
          ),
        ).toEqual(expected);
      }
    },
  );

  it("allows timers to run during the unchanged production work factor", async () => {
    let timerRan = false;
    const timer = setTimeout(() => {
      timerRan = true;
    }, 0);
    try {
      const password = Buffer.from("test-only-password");
      const salt = Buffer.alloc(16, 7);
      const derived = await derivePasswordBytes(password, salt, 120_000, 64);
      expect(timerRan).toBe(true);
      expect(Buffer.from(derived)).toEqual(
        pbkdf2Sync(password, salt, 120_000, 64, "sha256"),
      );
    } finally {
      clearTimeout(timer);
    }
  });
});
