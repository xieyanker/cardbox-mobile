import * as SecureStore from "expo-secure-store";
import { getRandomBytesAsync } from "expo-crypto";
import CryptoJS from "crypto-js";
import { derivePasswordBytes } from "./cardbox-pbkdf2";
import { Platform } from "react-native";
import { z } from "zod";
import { MAX_BACKUP_BYTES } from "../shared/cardbox";

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

async function deriveBackupKey(password: string, salt: string, length: number) {
  // Keep the original parameters and UTF-8 encoding, while yielding to the UI.
  const bytes = await derivePasswordBytes(
    wordBytes(CryptoJS.enc.Utf8.parse(password)),
    wordBytes(CryptoJS.enc.Hex.parse(salt)),
    ITERATIONS,
    length,
  );
  return CryptoJS.lib.WordArray.create(bytes);
}

async function backupKeys(password: string, salt: string) {
  const words = await deriveBackupKey(password, salt, 64);
  return {
    encryption: CryptoJS.lib.WordArray.create(words.words.slice(0, 8), 32),
    authentication: CryptoJS.lib.WordArray.create(words.words.slice(8, 16), 32),
  };
}

export async function encryptBackup(value: string, password: string) {
  if (!password.trim()) throw new Error("请输入备份密码。");
  const salt = (await randomWords(16)).toString();
  const iv = await randomWords(16);
  const keys = await backupKeys(password, salt);
  const envelope = {
    format: "cardbox-secure-v3" as const,
    salt,
    iv: iv.toString(),
    payload: CryptoJS.AES.encrypt(value, keys.encryption, { iv }).toString(),
  };
  const mac = CryptoJS.HmacSHA256(
    `${envelope.format}|${salt}|${envelope.iv}|${envelope.payload}`,
    keys.authentication,
  ).toString();
  return JSON.stringify({ ...envelope, mac });
}

export async function decryptBackup(value: string, password: string) {
  if (value.length > MAX_BACKUP_BYTES) throw new Error("备份文件过大。");
  const envelope = backupEnvelopeSchema.parse(JSON.parse(value));
  if (envelope.format === "cardbox-secure-v2") {
    const key = await deriveBackupKey(password, envelope.salt, 32);
    return decryptCipher(envelope.payload, key, envelope.iv);
  }
  const keys = await backupKeys(password, envelope.salt);
  const mac = CryptoJS.HmacSHA256(
    `${envelope.format}|${envelope.salt}|${envelope.iv}|${envelope.payload}`,
    keys.authentication,
  ).toString();
  if (!equalMac(mac, envelope.mac)) throw new Error("密码不正确或备份已损坏。");
  return decryptCipher(envelope.payload, keys.encryption, envelope.iv);
}
