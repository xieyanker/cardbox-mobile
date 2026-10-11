import CryptoJS from "crypto-js";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
} from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptBackup,
  decryptLocal,
  encryptBackup,
  encryptLocal,
} from "../lib/cardbox-security";
import * as kdf from "../lib/cardbox-pbkdf2";

const secure = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writes: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => secure.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secure.writes(key, value);
    secure.values.set(key, value);
  },
}));
vi.mock("expo-crypto", async () => {
  const { randomBytes } = await import("node:crypto");
  return {
    getRandomBytesAsync: async (size: number) =>
      new Uint8Array(randomBytes(size)),
  };
});

beforeEach(() => {
  secure.values.clear();
  secure.writes.mockClear();
});

describe("encrypted local storage", () => {
  it("initializes one device key for concurrent first writes", async () => {
    const values = await Promise.all([
      encryptLocal("first"),
      encryptLocal("second"),
    ]);
    expect(secure.writes).toHaveBeenCalledTimes(1);
    expect(await Promise.all(values.map(decryptLocal))).toEqual([
      "first",
      "second",
    ]);
  });

  it("rejects tampered ciphertext", async () => {
    const envelope = JSON.parse(await encryptLocal("private"));
    envelope.iv = "0".repeat(32);
    await expect(decryptLocal(JSON.stringify(envelope))).rejects.toThrow(
      "完整性",
    );
  });

  it("does not invent a replacement key when existing data has lost its key", async () => {
    const value = await encryptLocal("private");
    secure.values.clear();
    secure.writes.mockClear();
    await expect(decryptLocal(value)).rejects.toThrow("密钥");
    expect(secure.writes).not.toHaveBeenCalled();
  });

  it("can still read original passphrase-encrypted local data", async () => {
    const key = "old-device-key";
    secure.values.set("cardbox.device.key.v1", key);
    const old = CryptoJS.AES.encrypt("old cards", key).toString();
    expect(await decryptLocal(old)).toBe("old cards");
  });
});

describe("password backup compatibility and integrity", () => {
  it("round-trips v4 and matches independent AES, full-strength PBKDF2 and HMAC results", async () => {
    const value = await encryptBackup(
      '{"version":3,"cards":[]}',
      "correct password",
    );
    expect(await decryptBackup(value, "correct password")).toBe(
      '{"version":3,"cards":[]}',
    );
    const exported = JSON.parse(value);
    expect(exported.format).toBe("cardbox-secure-v4");
    const master = pbkdf2Sync(
      "correct password",
      Buffer.from(exported.salt, "hex"),
      120_000,
      32,
      "sha256",
    );
    const encryption = createHmac("sha256", master)
      .update("cardbox.backup.encryption.v4")
      .digest();
    const authentication = createHmac("sha256", master)
      .update("cardbox.backup.authentication.v4")
      .digest();
    const originalCipher = createDecipheriv(
      "aes-256-cbc",
      encryption,
      Buffer.from(exported.iv, "hex"),
    );
    expect(
      Buffer.concat([
        originalCipher.update(Buffer.from(exported.payload, "base64")),
        originalCipher.final(),
      ]).toString("utf8"),
    ).toBe('{"version":3,"cards":[]}');
    expect(
      createHmac("sha256", authentication)
        .update(
          `${exported.format}|${exported.salt}|${exported.iv}|${exported.check}|${exported.payload}`,
        )
        .digest("hex"),
    ).toBe(exported.mac);
    expect(
      createHmac("sha256", authentication)
        .update(
          `cardbox.backup.password.v4|${exported.format}|${exported.salt}|${exported.iv}`,
        )
        .digest("hex"),
    ).toBe(exported.check);
    await expect(decryptBackup(value, "wrong password")).rejects.toThrow();
    const envelope = JSON.parse(value);
    envelope.salt = "0".repeat(32);
    await expect(
      decryptBackup(JSON.stringify(envelope), "correct password"),
    ).rejects.toThrow();
  }, 30_000);

  it("rejects a wrong v4 password before hashing or decrypting a large payload", async () => {
    const value = await encryptBackup("x".repeat(1024 * 1024), "correct");
    const aes = vi.spyOn(CryptoJS.AES, "decrypt");
    const mac = vi.spyOn(CryptoJS, "HmacSHA256");
    try {
      await expect(decryptBackup(value, "wrong")).rejects.toThrow("密码不正确");
      expect(aes).not.toHaveBeenCalled();
      expect(
        mac.mock.calls.every(
          ([message]) => typeof message === "string" && message.length < 256,
        ),
      ).toBe(true);
    } finally {
      aes.mockRestore();
      mac.mockRestore();
    }
  });

  it.each(["payload", "mac"])(
    "authenticates v4 %s before AES decryption",
    async (field) => {
      const envelope = JSON.parse(
        await encryptBackup("private cards", "correct"),
      );
      const value = envelope[field] as string;
      envelope[field] = (value[0] === "a" ? "b" : "a") + value.slice(1);
      const aes = vi.spyOn(CryptoJS.AES, "decrypt");
      try {
        await expect(
          decryptBackup(JSON.stringify(envelope), "correct"),
        ).rejects.toThrow("完整性");
        expect(aes).not.toHaveBeenCalled();
      } finally {
        aes.mockRestore();
      }
    },
  );

  function legacyV3() {
    const salt = "0123456789abcdef0123456789abcdef";
    const iv = "fedcba9876543210fedcba9876543210";
    const keys = pbkdf2Sync(
      "legacy v3 password",
      Buffer.from(salt, "hex"),
      120_000,
      64,
      "sha256",
    );
    const cipher = createCipheriv(
      "aes-256-cbc",
      keys.subarray(0, 32),
      Buffer.from(iv, "hex"),
    );
    const payload = Buffer.concat([
      cipher.update("legacy v3 backup", "utf8"),
      cipher.final(),
    ]).toString("base64");
    const format = "cardbox-secure-v3";
    const mac = createHmac("sha256", keys.subarray(32))
      .update(`${format}|${salt}|${iv}|${payload}`)
      .digest("hex");
    return JSON.stringify({ format, salt, iv, payload, mac });
  }

  it("reads v3 produced by an independent original-format implementation", async () => {
    expect(await decryptBackup(legacyV3(), "legacy v3 password")).toBe(
      "legacy v3 backup",
    );
  });

  it("rejects a wrong v3 password after only deriving the authentication block", async () => {
    const value = legacyV3();
    const derive = vi.spyOn(kdf, "derivePasswordBytes");
    const aes = vi.spyOn(CryptoJS.AES, "decrypt");
    try {
      await expect(decryptBackup(value, "wrong")).rejects.toThrow("密码不正确");
      expect(derive).toHaveBeenCalledTimes(1);
      expect(derive.mock.calls[0].slice(2)).toEqual([120_000, 32, 2]);
      expect(aes).not.toHaveBeenCalled();
    } finally {
      derive.mockRestore();
      aes.mockRestore();
    }
  });

  it("restores backups produced by the original v2 algorithm", async () => {
    const salt = CryptoJS.enc.Hex.parse("0123456789abcdef0123456789abcdef");
    const iv = CryptoJS.enc.Hex.parse("fedcba9876543210fedcba9876543210");
    const key = CryptoJS.PBKDF2("legacy password", salt, {
      keySize: 256 / 32,
      iterations: 120000,
    });
    const payload = CryptoJS.AES.encrypt("legacy backup", key, {
      iv,
    }).toString();
    expect(
      await decryptBackup(
        JSON.stringify({
          format: "cardbox-secure-v2",
          salt: salt.toString(),
          iv: iv.toString(),
          payload,
        }),
        "legacy password",
      ),
    ).toBe("legacy backup");
  }, 30_000);
});
