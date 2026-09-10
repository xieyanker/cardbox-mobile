import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { Platform } from 'react-native';

const DEVICE_KEY = 'cardbox.device.key.v1';

async function getDeviceKey() {
  if (Platform.OS === 'web') return 'cardbox-web-preview-key';
  let key = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!key) {
    key = CryptoJS.lib.WordArray.random(256 / 8).toString(CryptoJS.enc.Base64);
    await SecureStore.setItemAsync(DEVICE_KEY, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  }
  return key;
}

export async function encryptLocal(value: string) {
  const key = await getDeviceKey();
  return CryptoJS.AES.encrypt(value, key).toString();
}

export async function decryptLocal(value: string) {
  const key = await getDeviceKey();
  const bytes = CryptoJS.AES.decrypt(value, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function encryptBackup(value: string, password: string) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8);
  const key = CryptoJS.PBKDF2(password, salt, { keySize: 256 / 32, iterations: 120000 });
  const iv = CryptoJS.lib.WordArray.random(128 / 8);
  const encrypted = CryptoJS.AES.encrypt(value, key, { iv }).toString();
  return JSON.stringify({ format: 'cardbox-secure-v2', salt: salt.toString(), iv: iv.toString(), payload: encrypted });
}

export function decryptBackup(value: string, password: string) {
  const envelope = JSON.parse(value);
  if (envelope.format !== 'cardbox-secure-v2') throw new Error('unsupported');
  const salt = CryptoJS.enc.Hex.parse(envelope.salt);
  const iv = CryptoJS.enc.Hex.parse(envelope.iv);
  const key = CryptoJS.PBKDF2(password, salt, { keySize: 256 / 32, iterations: 120000 });
  const bytes = CryptoJS.AES.decrypt(envelope.payload, key, { iv });
  const result = bytes.toString(CryptoJS.enc.Utf8);
  if (!result) throw new Error('invalid-password');
  return result;
}
