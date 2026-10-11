import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";

function validateParameters(
  iterations: number,
  length: number,
  firstBlock: number,
) {
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    !Number.isSafeInteger(firstBlock) ||
    firstBlock < 1 ||
    firstBlock + Math.ceil(length / 32) - 1 > 0xffffffff
  )
    throw new Error("密码派生参数无效。");
}

/** RFC 8018 PBKDF2-HMAC-SHA256, using native WebCrypto when available. */
export async function derivePasswordBytes(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
  firstBlock = 1,
) {
  validateParameters(iterations, length, firstBlock);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const passwordCopy = new Uint8Array(password);
    try {
      const key = await subtle.importKey("raw", passwordCopy, "PBKDF2", false, [
        "deriveBits",
      ]);
      const offset = (firstBlock - 1) * 32;
      const bits = await subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: new Uint8Array(salt),
          iterations,
        },
        key,
        (offset + length) * 8,
      );
      const bytes = new Uint8Array(bits);
      const result = bytes.slice(offset);
      bytes.fill(0);
      return result;
    } catch {
      // Expo Go / Hermes and insecure Web origins can lack usable WebCrypto.
      // The fallback uses identical parameters, never a cheaper work factor.
    } finally {
      passwordCopy.fill(0);
    }
  }
  return derivePasswordBytesFallback(
    password,
    salt,
    iterations,
    length,
    firstBlock,
  );
}

/** Reuse HMAC state and a fixed digest buffer; timer yields keep Hermes responsive. */
export async function derivePasswordBytesFallback(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
  firstBlock = 1,
) {
  validateParameters(iterations, length, firstBlock);
  const output = new Uint8Array(length);
  const base = hmac.create(sha256, password);
  const salted = base.clone().update(salt);
  const working = base.clone();
  const intermediate = new Uint8Array(32);
  const blockIndex = new Uint8Array(4);
  const view = new DataView(blockIndex.buffer);
  let yieldedAt = Date.now();
  try {
    for (
      let offset = 0, block = firstBlock;
      offset < length;
      offset += 32, block++
    ) {
      view.setUint32(0, block, false);
      salted._cloneInto(working).update(blockIndex).digestInto(intermediate);
      const combined = output.subarray(offset, Math.min(offset + 32, length));
      combined.set(intermediate.subarray(0, combined.length));
      for (let iteration = 1; iteration < iterations; iteration++) {
        base._cloneInto(working).update(intermediate).digestInto(intermediate);
        for (let byte = 0; byte < combined.length; byte++)
          combined[byte] ^= intermediate[byte];
        if (iteration % 256 === 0 && Date.now() - yieldedAt >= 12) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          yieldedAt = Date.now();
        }
      }
    }
    return output;
  } catch (error) {
    output.fill(0);
    throw error;
  } finally {
    base.destroy();
    salted.destroy();
    working.destroy();
    intermediate.fill(0);
  }
}
