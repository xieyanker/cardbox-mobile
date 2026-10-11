import { describe, expect, it, vi } from "vitest";
import { createAccessController } from "../lib/cardbox-access";

describe("device access", () => {
  it("waits for a system picker result to be followed by the foreground event", async () => {
    const access = createAccessController({
      native: true,
      verify: async () => true,
    });
    await access.unlock();
    access.onAppState("background");
    const foreground = access.waitForForeground();
    expect(access.snapshot().obscured).toBe(true);
    access.onAppState("active");
    expect(await foreground).toBe(true);
    expect(access.snapshot().obscured).toBe(false);
  });

  it("does not resume in the background or bypass a lock after a long picker session", async () => {
    vi.useFakeTimers();
    try {
      let now = 0;
      const access = createAccessController({
        native: true,
        now: () => now,
        verify: async () => true,
      });
      await access.unlock();
      access.onAppState("background");
      const waiting = access.waitForForeground();
      await vi.advanceTimersByTimeAsync(1500);
      expect(await waiting).toBe(false);
      now = 61_000;
      access.onAppState("active");
      expect(await access.waitForForeground()).toBe(true);
      expect(access.snapshot().locked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("allows Android PIN fallback to return from a system Activity while keeping content covered", async () => {
    let finish!: (success: boolean) => void;
    const access = createAccessController({
      native: true,
      systemCredentialActivity: true,
      verify: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const unlocking = access.unlock();
    access.onAppState("background");
    expect(access.snapshot().obscured).toBe(true);
    finish(true);
    await Promise.resolve();
    expect(access.snapshot().locked).toBe(true);
    access.onAppState("active");
    expect(await unlocking).toBe(true);
    expect(access.snapshot().obscured).toBe(false);
  });

  it("does not unlock after a cancelled PIN Activity", async () => {
    let finish!: (success: boolean) => void;
    const access = createAccessController({
      native: true,
      systemCredentialActivity: true,
      verify: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const unlocking = access.unlock();
    access.onAppState("background");
    access.onAppState("active");
    finish(false);
    expect(await unlocking).toBe(false);
    expect(access.snapshot().locked).toBe(true);
  });

  it("requires authentication on a native cold start", async () => {
    const verify = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const access = createAccessController({ native: true, verify });
    expect(access.snapshot().locked).toBe(true);
    expect(await access.unlock()).toBe(false);
    expect(access.snapshot().locked).toBe(true);
    expect(await access.unlock()).toBe(true);
    expect(access.snapshot().locked).toBe(false);
  });

  it("covers content immediately and measures from the first inactive event", async () => {
    let time = 0;
    const access = createAccessController({
      native: true,
      verify: async () => true,
      now: () => time,
    });
    await access.unlock();
    access.onAppState("inactive");
    expect(access.snapshot().obscured).toBe(true);
    time = 59_000;
    access.onAppState("background");
    time = 60_000;
    access.onAppState("active");
    expect(access.snapshot().locked).toBe(true);
  });

  it("rejects authentication that completes after leaving the app", async () => {
    let finish!: (success: boolean) => void;
    const access = createAccessController({
      native: true,
      verify: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const unlocking = access.unlock();
    access.onAppState("background");
    access.onAppState("active");
    finish(true);
    expect(await unlocking).toBe(false);
    expect(access.snapshot().locked).toBe(true);
  });

  it("does not mistake a system authentication dialog for leaving the app", async () => {
    let finish!: (success: boolean) => void;
    const access = createAccessController({
      native: true,
      verify: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const unlocking = access.unlock();
    access.onAppState("inactive");
    access.onAppState("active");
    finish(true);
    expect(await unlocking).toBe(true);
  });

  it("honors disabled automatic lock but still clears sensitive visibility", async () => {
    const access = createAccessController({
      native: true,
      verify: async () => true,
    });
    await access.unlock();
    access.setTimeout(0);
    access.onAppState("background");
    access.onAppState("active");
    expect(access.snapshot().locked).toBe(false);
    expect(access.snapshot().privacyVersion).toBeGreaterThan(0);
  });
});
