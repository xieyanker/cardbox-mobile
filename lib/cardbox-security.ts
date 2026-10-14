import * as SecureStore from "expo-secure-store";
import { getRandomBytesAsync } from "expo-crypto";
import CryptoJS from "crypto-js";
import { derivePasswordBytes } from "./cardbox-pbkdf2";
import { Platform } from "react-native";
import { z } from "zod";
import { MAX_BACKUP_BYTES } from "../shared/cardbox";
import { assertBackupCapacity, utf8Bytes } from "../shared/cardbox-backup-size";

const DEVICE_KEY = "cardbox.device.key.v1";
const ITERATIONS = 120_000;
let keyRequest: Promise<string> | null = null;

async function randomWords(size: number) {
  return CryptoJS.lib.WordArray.create(await getRandomBytesAsync(size));
}

async function getDeviceKey(create: boolean) {
  if (keyRequest) return keyRequest;
  const request = (async () => {
    let key =
      Platform.OS === "web"
        ? globalThis.localStorage.getItem(DEVICE_KEY)
        : await SecureStore.getItemAsync(DEVICE_KEY);
    if (!key) {
      if (!create) throw new Error("设备密钥不可用，请使用加密备份恢复。");
      key = (await randomWords(32)).toString(CryptoJS.enc.Base64);
      if (Platform.OS === "web")
        globalThis.localStorage.setItem(DEVICE_KEY, key);
      else
        await SecureStore.setItemAsync(DEVICE_KEY, key, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
    }
    return key;
  })();
  keyRequest = request;
  try {
    return await request;
  } finally {
    keyRequest = null;
  }
}

const hex16 = z.string().regex(/^[a-f0-9]{32}$/);
const payloadSchema = z
  .string()
  .min(1)
  .max(MAX_BACKUP_BYTES * 2)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);
const localEnvelopeSchema = z.object({
  format: z.literal("cardbox-local-v2"),
  iv: hex16,
  payload: payloadSchema,
  mac: z.string().regex(/^[a-f0-9]{64}$/),
});
const backupEnvelopeSchema = z.discriminatedUnion("format", [
  z.object({
    format: z.literal("cardbox-secure-v2"),
    salt: hex16,
    iv: hex16,
    payload: payloadSchema,
  }),
  z.object({
    format: z.literal("cardbox-secure-v3"),
    salt: hex16,
    iv: hex16,
    payload: payloadSchema,
    mac: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({
    format: z.literal("cardbox-secure-v4"),
    salt: hex16,
    iv: hex16,
    check: z.string().regex(/^[a-f0-9]{64}$/),
    payload: payloadSchema,
    mac: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);

function equalMac(expected: string, actual: string) {
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++)
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

function decryptCipher(
  payload: string,
  key: CryptoJS.lib.WordArray,
  iv: string,
) {
  const result = CryptoJS.AES.decrypt(payload, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
  }).toString(CryptoJS.enc.Utf8);
  if (!result) throw new Error("数据无法解密。");
  return result;
}

export async function encryptLocal(value: string) {
  const key = CryptoJS.enc.Base64.parse(await getDeviceKey(true));
  const iv = await randomWords(16);
  const encryptionKey = CryptoJS.HmacSHA256("cardbox.local.encryption.v2", key);
  const macKey = CryptoJS.HmacSHA256("cardbox.local.authentication.v2", key);
  const envelope = {
    format: "cardbox-local-v2" as const,
    iv: iv.toString(),
    payload: CryptoJS.AES.encrypt(value, encryptionKey, { iv }).toString(),
  };
  const mac = CryptoJS.HmacSHA256(
    `${envelope.format}|${envelope.iv}|${envelope.payload}`,
    macKey,
  ).toString();
  return JSON.stringify({ ...envelope, mac });
}

export async function decryptLocal(value: string) {
  if (!value.trimStart().startsWith("{")) {
    // The public Web passphrase is supported only for reading old preview data.
    const legacyKey =
      Platform.OS === "web"
        ? "cardbox-web-preview-key"
        : await getDeviceKey(false);
    const result = CryptoJS.AES.decrypt(value, legacyKey).toString(
      CryptoJS.enc.Utf8,
    );
    if (!result) throw new Error("旧版数据无法解密。");
    return result;
  }
  const envelope = localEnvelopeSchema.parse(JSON.parse(value));
  const key = CryptoJS.enc.Base64.parse(await getDeviceKey(false));
  const macKey = CryptoJS.HmacSHA256("cardbox.local.authentication.v2", key);
  const mac = CryptoJS.HmacSHA256(
    `${envelope.format}|${envelope.iv}|${envelope.payload}`,
    macKey,
  ).toString();
  if (!equalMac(mac, envelope.mac)) throw new Error("数据完整性校验失败。");
  return decryptCipher(
    envelope.payload,
    CryptoJS.HmacSHA256("cardbox.local.encryption.v2", key),
    envelope.iv,
  );
}

function wordBytes(value: CryptoJS.lib.WordArray) {
  return Uint8Array.from(
    { length: value.sigBytes },
    (_, index) => (value.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 255,
  );
}

async function deriveBackupKey(
  password: string,
  salt: string,
  length: number,
  firstBlock = 1,
) {
  // Keep the original parameters and UTF-8 encoding, while yielding to the UI.
  const bytes = await derivePasswordBytes(
    wordBytes(CryptoJS.enc.Utf8.parse(password)),
    wordBytes(CryptoJS.enc.Hex.parse(salt)),
    ITERATIONS,
    length,
    firstBlock,
  );
  try {
    return CryptoJS.lib.WordArray.create(bytes);
  } finally {
    bytes.fill(0);
  }
}

async function backupKeysV4(password: string, salt: string) {
  // One full-strength PBKDF2 block, then domain-separated encryption / MAC subkeys.
  // v3 also needs only one block per password guess, but derived both blocks for every operation.
  const master = await deriveBackupKey(password, salt, 32);
  try {
    return {
      encryption: CryptoJS.HmacSHA256("cardbox.backup.encryption.v4", master),
      authentication: CryptoJS.HmacSHA256(
        "cardbox.backup.authentication.v4",
        master,
      ),
    };
  } finally {
    master.words.fill(0);
    master.sigBytes = 0;
  }
}

export async function encryptBackup(value: string, password: string) {
  if (!password.trim()) throw new Error("请输入备份密码。");
  assertBackupCapacity(utf8Bytes(value));
  const plaintext = CryptoJS.enc.Utf8.parse(value);
  const salt = (await randomWords(16)).toString();
  const iv = await randomWords(16);
  const keys = await backupKeysV4(password, salt);
  const format = "cardbox-secure-v4" as const;
  const header = `${format}|${salt}|${iv.toString()}`;
  // This check still requires all 120,000 rounds; it is not a cheap password hash.
  const check = CryptoJS.HmacSHA256(
    `cardbox.backup.password.v4|${header}`,
    keys.authentication,
  ).toString();
  const envelope = {
    format,
    salt,
    iv: iv.toString(),
    check,
    payload: CryptoJS.AES.encrypt(plaintext, keys.encryption, {
      iv,
    }).toString(),
  };
  const mac = CryptoJS.HmacSHA256(
    `${header}|${check}|${envelope.payload}`,
    keys.authentication,
  ).toString();
  return JSON.stringify({ ...envelope, mac });
}

export async function decryptBackup(value: string, password: string) {
  if (!password.trim()) throw new Error("请输入备份密码。");
  if (value.length > MAX_BACKUP_BYTES) throw new Error("备份文件过大。");
  const envelope = backupEnvelopeSchema.parse(JSON.parse(value));
  if (envelope.format === "cardbox-secure-v2") {
    const key = await deriveBackupKey(password, envelope.salt, 32);
    try {
      return decryptCipher(envelope.payload, key, envelope.iv);
    } catch {
      throw new Error("密码不正确或备份已损坏。");
    }
  }
  if (envelope.format === "cardbox-secure-v4") {
    const keys = await backupKeysV4(password, envelope.salt);
    const header = `${envelope.format}|${envelope.salt}|${envelope.iv}`;
    const check = CryptoJS.HmacSHA256(
      `cardbox.backup.password.v4|${header}`,
      keys.authentication,
    ).toString();
    if (!equalMac(check, envelope.check))
      throw new Error("密码不正确或备份已损坏。");
    const mac = CryptoJS.HmacSHA256(
      `${header}|${envelope.check}|${envelope.payload}`,
      keys.authentication,
    ).toString();
    if (!equalMac(mac, envelope.mac))
      throw new Error("备份完整性校验失败，文件可能已损坏。");
    return decryptCipher(envelope.payload, keys.encryption, envelope.iv);
  }
  // v3 stores the MAC key in PBKDF2 block 2. Authenticate first; derive block 1 only on success.
  const authentication = await deriveBackupKey(password, envelope.salt, 32, 2);
  const mac = CryptoJS.HmacSHA256(
    `${envelope.format}|${envelope.salt}|${envelope.iv}|${envelope.payload}`,
    authentication,
  ).toString();
  if (!equalMac(mac, envelope.mac)) throw new Error("密码不正确或备份已损坏。");
  const encryption = await deriveBackupKey(password, envelope.salt, 32);
  return decryptCipher(envelope.payload, encryption, envelope.iv);
}
