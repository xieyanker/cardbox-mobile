import { describe, expect, it, vi } from "vitest";
import { createCardRepository } from "../lib/cardbox-repository";
import { CARD_STORAGE_KEY, type Card } from "../shared/cardbox";

const card: Card = {
  id: "one",
  name: "测试卡",
  number: "1234567890123456",
  cvv: "123",
  expiry: "12/30",
  note: "",
  tone: "#2F59C7",
  type: "debit",
};

function setup(raw: string | null) {
  let saved = raw;
  const storage = {
    getItem: vi.fn(async () => saved),
    setItem: vi.fn(async (_key: string, value: string) => {
      saved = value;
    }),
  };
  const repository = createCardRepository({
    storage,
    encrypt: vi.fn(async (value) => `encrypted:${value}`),
    decrypt: vi.fn(async (value) => {
      if (!value.startsWith("encrypted:")) throw new Error("cannot decrypt");
      return value.slice(10);
    }),
  });
  return { repository, storage, raw: () => saved };
}

describe("card persistence", () => {
  it("archives unreadable original data before explicit backup recovery", async () => {
    const entries = new Map([[CARD_STORAGE_KEY, "unreadable original"]]);
    const repository = createCardRepository({
      storage: {
        getItem: async (key) => entries.get(key) ?? null,
        setItem: async (key, value) => {
          entries.set(key, value);
        },
      },
      encrypt: async (value) => `encrypted:${value}`,
      decrypt: async () => {
        throw new Error("missing device key");
      },
    });
    await expect(repository.load()).rejects.toThrow("missing device key");
    expect(await repository.recover([card])).toEqual([card]);
    expect(
      [...entries.entries()].find(([key]) =>
        key.startsWith(`${CARD_STORAGE_KEY}.recovery.`),
      )?.[1],
    ).toBe("unreadable original");
    expect(entries.get(CARD_STORAGE_KEY)).toBe(
      `encrypted:${JSON.stringify([card])}`,
    );
    expect(await repository.read()).toEqual([card]);
  });

  it("refuses recovery if preserving the original data fails", async () => {
    const storage = {
      getItem: async () => "unreadable original",
      setItem: vi.fn(async (_key: string, _value: string) => {
        throw new Error("disk full");
      }),
    };
    const encrypt = vi.fn(async (value) => value);
    const repository = createCardRepository({
      storage,
      encrypt,
      decrypt: async (value) => value,
    });
    await expect(repository.recover([card])).rejects.toThrow("disk full");
    expect(encrypt).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0][0]).toContain(".recovery.");
  });

  it("starts empty and does not write while loading", async () => {
    const { repository, storage } = setup(null);
    expect(await repository.load()).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("waits for the historical read before accepting a write", async () => {
    const { repository, storage, raw } = setup(null);
    let resolveRead!: (value: string) => void;
    storage.getItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const load = repository.load();
    const update = repository.update((cards) => [
      ...cards,
      { ...card, id: "two" },
    ]);
    await Promise.resolve();
    expect(storage.setItem).not.toHaveBeenCalled();
    resolveRead(`encrypted:${JSON.stringify([card])}`);
    await load;
    expect((await update).map((item) => item.id)).toEqual(["one", "two"]);
    expect(raw()).toContain("encrypted:");
  });

  it("preserves unreadable data and refuses to overwrite it", async () => {
    const { repository, storage, raw } = setup("corrupt-ciphertext");
    await expect(repository.load()).rejects.toThrow();
    await expect(repository.replace([])).rejects.toThrow();
    expect(raw()).toBe("corrupt-ciphertext");
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("serializes rapid updates and restores their order after restart", async () => {
    const { repository, raw } = setup(JSON.stringify([card]));
    await Promise.all([
      repository.update((cards) => [...cards, { ...card, id: "two" }]),
      repository.update((cards) => [...cards, { ...card, id: "three" }]),
    ]);
    expect(
      (await setup(raw()).repository.load()).map((item) => item.id),
    ).toEqual(["one", "two", "three"]);
  });

  it("does not commit failed writes and can retry", async () => {
    const { repository, storage } = setup(JSON.stringify([card]));
    storage.setItem.mockRejectedValueOnce(new Error("disk full"));
    await expect(repository.replace([])).rejects.toThrow("disk full");
    expect(await repository.read()).toEqual([card]);
    expect(await repository.replace([])).toEqual([]);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      CARD_STORAGE_KEY,
      "encrypted:[]",
    );
  });

  it("rejects invalid and duplicate records before writing", async () => {
    const { repository, storage } = setup(null);
    await expect(repository.replace([card, card])).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
