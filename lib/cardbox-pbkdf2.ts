import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";

/** RFC 8018 PBKDF2-HMAC-SHA256, with timer yields so Hermes can render and handle AppState. */
export async function derivePasswordBytes(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
) {
  const output = new Uint8Array(length);
  const base = hmac.create(sha256, password);
  const salted = base.clone().update(salt);
  const blockIndex = new Uint8Array(4);
  const view = new DataView(blockIndex.buffer);
  let yieldedAt = Date.now();
  try {
    for (let offset = 0, block = 1; offset < length; offset += 32, block++) {
      view.setUint32(0, block, false);
      let intermediate = salted.clone().update(blockIndex).digest();
      const combined = intermediate.slice();
      for (let iteration = 1; iteration < iterations; iteration++) {
        intermediate = base.clone().update(intermediate).digest();
        for (let byte = 0; byte < 32; byte++)
          combined[byte] ^= intermediate[byte];
        if (iteration % 256 === 0 && Date.now() - yieldedAt >= 8) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          yieldedAt = Date.now();
        }
      }
      output.set(combined.subarray(0, Math.min(32, length - offset)), offset);
    }
    return output;
  } finally {
    base.destroy();
    salted.destroy();
  }
}
