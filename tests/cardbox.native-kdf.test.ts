import { pbkdf2Sync, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { derivePasswordBytes } from "../lib/cardbox-pbkdf2";
import {
  NativePasswordBridge,
  PASSWORD_SERVICE_HTML,
  registerPasswordDeriver,
  isPasswordServiceUrl,
  type DerivationRequest,
} from "../lib/cardbox-native-kdf";

function service(secure = true) {
  let derive: (request: DerivationRequest) => void;
  const bridge = new NativePasswordBridge((request) =>
    derive(structuredClone(request)),
  );
  const window = {
    isSecureContext: secure,
    crypto: webcrypto,
    ReactNativeWebView: {
      postMessage: (message: string) => bridge.receive(message),
    },
    set cardboxDerive(value: typeof derive) {
      derive = value;
    },
  };
  const script = PASSWORD_SERVICE_HTML.match(
    /<script nonce="cardbox-kdf">([\s\S]*)<\/script>/,
  )![1];
  runInNewContext(script, { window, crypto: webcrypto, Uint8Array });
  return bridge;
}

describe("offline native password worker", () => {
  it("accepts Android's slashless message origin and blocks foreign pages", () => {
    for (const url of [
      "https://cardbox.invalid/",
      "https://cardbox.invalid",
      "about:blank",
    ])
      expect(isPasswordServiceUrl(url)).toBe(true);
    for (const url of [
      "https://cardbox.invalid.evil/",
      "http://cardbox.invalid/",
      "https://example.com/",
      "data:text/html,evil",
    ])
      expect(isPasswordServiceUrl(url)).toBe(false);
  });
  it("can remount after disposal without reusing queued secret work", async () => {
    const bridge = new NativePasswordBridge(() => undefined);
    bridge.fail();
    bridge.activate();
    bridge.receive('{"type":"ready","available":true}');
    const result = bridge.derive(
      new Uint8Array([1]),
      new Uint8Array([2]),
      1,
      32,
      1,
    );
    bridge.receive(JSON.stringify({ id: 1, bytes: new Array(32).fill(1) }));
    expect(await result).toEqual(new Uint8Array(32).fill(1));
    bridge.fail();
  });
  it.each([32, 48, 64])(
    "matches independent UTF-8 PBKDF2 output for %i bytes",
    async (length) => {
      const bridge = service();
      const password = Buffer.from("密码🔐", "utf8");
      const salt = Buffer.alloc(16, 7);
      try {
        expect(
          Buffer.from(await bridge.derive(password, salt, 120_000, length, 1)),
        ).toEqual(pbkdf2Sync(password, salt, 120_000, length, "sha256"));
        expect(password.toString("utf8")).toBe("密码🔐");
      } finally {
        bridge.fail();
      }
    },
  );
  it("preserves legacy block 2 and routes the public KDF to the native worker", async () => {
    const bridge = service();
    const unregister = registerPasswordDeriver(bridge.derive);
    const password = Buffer.from("old-backup-password");
    const salt = Buffer.alloc(16, 5);
    try {
      expect(
        Buffer.from(await derivePasswordBytes(password, salt, 120_000, 32, 2)),
      ).toEqual(pbkdf2Sync(password, salt, 120_000, 64, "sha256").subarray(32));
    } finally {
      unregister();
      bridge.fail();
    }
  });
  it("queues before ready, correlates concurrent responses, wipes transport copies", async () => {
    const sent: DerivationRequest[] = [];
    const bridge = new NativePasswordBridge((request) => sent.push(request));
    const first = bridge.derive(
      new Uint8Array([9]),
      new Uint8Array([7]),
      1,
      32,
      1,
    );
    const second = bridge.derive(
      new Uint8Array([8]),
      new Uint8Array([6]),
      1,
      32,
      1,
    );
    expect(sent).toHaveLength(0);
    bridge.receive('{"type":"ready","available":true}');
    bridge.receive('{"type":"ready","available":true}');
    expect(sent).toHaveLength(2);
    expect(sent[0].password).toEqual([0]);
    bridge.receive(
      JSON.stringify({ id: sent[1].id, bytes: new Array(32).fill(2) }),
    );
    bridge.receive(
      JSON.stringify({ id: sent[0].id, bytes: new Array(32).fill(1) }),
    );
    expect(await first).toEqual(new Uint8Array(32).fill(1));
    expect(await second).toEqual(new Uint8Array(32).fill(2));
    bridge.fail();
  });
  it("rejects an unavailable secure context immediately without a slow fallback", async () => {
    const bridge = service(false);
    const unregister = registerPasswordDeriver(bridge.derive);
    try {
      await expect(
        derivePasswordBytes(
          new Uint8Array([1]),
          new Uint8Array([2]),
          120_000,
          32,
        ),
      ).rejects.toThrow("系统密码加速服务不可用");
    } finally {
      unregister();
      bridge.fail();
    }
  });
  it("rejects malformed responses and ignores unrelated messages", async () => {
    const bridge = new NativePasswordBridge(() => undefined);
    bridge.receive("null");
    bridge.receive("not-json");
    bridge.receive('{"type":"ready","available":true}');
    const result = bridge.derive(
      new Uint8Array([1]),
      new Uint8Array([2]),
      1,
      32,
      1,
    );
    bridge.receive(JSON.stringify({ id: 1, bytes: new Array(32).fill(256) }));
    await expect(result).rejects.toThrow("本机密码处理失败");
    bridge.fail();
  });
  it("cleans up timed out and unmounted work without returning partial keys", async () => {
    vi.useFakeTimers();
    const bridge = new NativePasswordBridge(() => undefined);
    try {
      const result = bridge.derive(
        new Uint8Array([1]),
        new Uint8Array([2]),
        1,
        32,
        1,
      );
      const rejected = expect(result).rejects.toThrow("密码处理超时");
      await vi.advanceTimersByTimeAsync(15_000);
      await rejected;
      const pending = bridge.derive(
        new Uint8Array([1]),
        new Uint8Array([2]),
        1,
        32,
        1,
      );
      const disposed = expect(pending).rejects.toThrow("服务已关闭");
      bridge.fail();
      await disposed;
      bridge.receive(JSON.stringify({ id: 2, bytes: new Array(32).fill(1) }));
    } finally {
      bridge.fail();
      vi.useRealTimers();
    }
  });
});
