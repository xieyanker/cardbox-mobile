import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  derivePasswordBytes,
  derivePasswordBytesFallback,
} from "../lib/cardbox-pbkdf2";

describe("backup password derivation", () => {
  it("falls back with unchanged output when WebCrypto is unavailable", async () => {
    vi.stubGlobal("crypto", {
      subtle: {
        importKey: async () => {
          throw new Error("unsupported");
        },
      },
    });
    try {
      const password = Buffer.from("password");
      const salt = Buffer.alloc(16, 7);
      expect(
        Buffer.from(await derivePasswordBytes(password, salt, 257, 32)),
      ).toEqual(pbkdf2Sync(password, salt, 257, 32, "sha256"));
    } finally {
      vi.unstubAllGlobals();
    }
  });
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
        expect(
          Buffer.from(
            await derivePasswordBytesFallback(
              password,
              salt,
              iterations,
              length,
            ),
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
      const derived = await derivePasswordBytesFallback(
        password,
        salt,
        120_000,
        64,
      );
      expect(timerRan).toBe(true);
      expect(Buffer.from(derived)).toEqual(
        pbkdf2Sync(password, salt, 120_000, 64, "sha256"),
      );
    } finally {
      clearTimeout(timer);
    }
  });
  it("derives the legacy authentication block directly without computing its encryption block", async () => {
    const password = Buffer.from("旧密码🔐");
    const salt = Buffer.alloc(16, 3);
    const expected = pbkdf2Sync(password, salt, 120_000, 64, "sha256").subarray(
      32,
    );
    expect(
      Buffer.from(
        await derivePasswordBytesFallback(password, salt, 120_000, 32, 2),
      ),
    ).toEqual(expected);
    expect(
      Buffer.from(await derivePasswordBytes(password, salt, 120_000, 32, 2)),
    ).toEqual(expected);
  });
});
