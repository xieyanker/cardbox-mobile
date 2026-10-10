import CryptoJS from "crypto-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptBackup,
  decryptLocal,
  encryptBackup,
  encryptLocal,
} from "../lib/cardbox-security";

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
  it("round-trips v3 and rejects both wrong passwords and changes", async () => {
    const value = await encryptBackup(
      '{"version":3,"cards":[]}',
      "correct password",
    );
    expect(decryptBackup(value, "correct password")).toBe(
      '{"version":3,"cards":[]}',
    );
    expect(() => decryptBackup(value, "wrong password")).toThrow();
    const envelope = JSON.parse(value);
    envelope.salt = "0".repeat(32);
    expect(() =>
      decryptBackup(JSON.stringify(envelope), "correct password"),
    ).toThrow();
  }, 30_000);

  it("restores backups produced by the original v2 algorithm", () => {
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
      decryptBackup(
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
