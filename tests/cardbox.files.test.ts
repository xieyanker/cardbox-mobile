import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBackupCards,
  cleanupOwnedImages,
  resolveOwnedImageUri,
  persistCardImage,
  restoreBackupCards,
} from "../lib/cardbox-files";
import type { Card } from "../shared/cardbox";

const files = vi.hoisted(() => ({
  write: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  counter: 0,
  size: 20,
  read: vi.fn(async () => "aW1hZ2U="),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `image-${++files.counter}`,
}));
vi.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  makeDirectoryAsync: async () => undefined,
  copyAsync: files.copy,
  writeAsStringAsync: files.write,
  deleteAsync: files.remove,
  getInfoAsync: async (uri: string) => ({
    exists: uri !== "file:///cache/missing.jpg",
    size: files.size,
  }),
  readAsStringAsync: files.read,
}));
const card: Card = {
  id: "one",
  name: "测试卡",
  number: "1234567890123456",
  cvv: "",
  expiry: "",
  note: "",
  tone: "#2F59C7",
  type: "debit",
};

beforeEach(() => {
  vi.clearAllMocks();
  files.counter = 0;
  files.size = 20;
  files.write.mockReset().mockResolvedValue(undefined);
  files.remove.mockReset().mockResolvedValue(undefined);
  files.copy.mockReset().mockResolvedValue(undefined);
});

describe("card images and backup restores", () => {
  it("rejects aggregate oversized images before reading any image data", async () => {
    files.size = 16 * 1024 * 1024;
    const cards = [card, { ...card, id: "two" }].map((c) => ({
      ...c,
      image: "file:///cache/large.jpg",
    }));
    await expect(buildBackupCards(cards)).rejects.toThrow("50 MB");
    expect(files.read).not.toHaveBeenCalled();
    expect(await buildBackupCards(cards, false)).toHaveLength(2);
  });
  it("resolves old app-container image references without altering arbitrary external paths", () => {
    expect(
      resolveOwnedImageUri(
        "file:///old-container/Documents/cardbox-images/card-1.png",
      ),
    ).toBe("file:///documents/cardbox-images/card-1.png");
    expect(resolveOwnedImageUri("file:///other/card.png")).toBe(
      "file:///other/card.png",
    );
    expect(
      resolveOwnedImageUri("file:///old/cardbox-images/../private.jpg"),
    ).toBe("file:///old/cardbox-images/../private.jpg");
  });
  it("exports card fields without touching a missing image only when text-only backup is explicitly selected", async () => {
    const result = await buildBackupCards(
      [{ ...card, image: "file:///cache/missing.jpg" }],
      false,
    );
    expect(result[0].image).toBeUndefined();
    expect(result[0].number).toBe(card.number);
    expect(result[0]).not.toHaveProperty("imageData");
  });
  it("only cleans unreferenced app-owned image files, preserving shared and external paths", async () => {
    await cleanupOwnedImages(
      [
        { ...card, image: "file:///documents/cardbox-images/old.jpg" },
        {
          ...card,
          id: "two",
          image: "file:///documents/cardbox-images/shared.png",
        },
        { ...card, id: "three", image: "file:///other/image.jpg" },
        {
          ...card,
          id: "four",
          image: "file:///documents/cardbox-images/../private.jpg",
        },
      ],
      [{ ...card, image: "file:///documents/cardbox-images/shared.png" }],
    );
    expect(files.remove).toHaveBeenCalledTimes(1);
    expect(files.remove).toHaveBeenCalledWith(
      "file:///documents/cardbox-images/old.jpg",
      { idempotent: true },
    );
  });
  it("removes a partial image when copying fails", async () => {
    files.copy.mockRejectedValueOnce(new Error("disk full"));
    await expect(persistCardImage("file:///cache/card.jpg")).rejects.toThrow(
      "disk full",
    );
    expect(files.remove).toHaveBeenCalledWith(
      "file:///documents/cardbox-images/image-1.jpg",
      { idempotent: true },
    );
  });

  it("preserves PNG metadata when re-exporting a restored card image", async () => {
    const backup = await buildBackupCards([
      { ...card, image: "file:///documents/cardbox-images/restored.png" },
    ]);
    expect(backup[0].imageMime).toBe("image/png");
  });

  it("copies temporary images into a persistent private directory", async () => {
    const uri = await persistCardImage("file:///cache/cropped.jpg");
    expect(uri).toBe("file:///documents/cardbox-images/image-1.jpg");
    expect(files.copy).toHaveBeenCalledWith({
      from: "file:///cache/cropped.jpg",
      to: uri,
    });
  });

  it("embeds images rather than exporting device-specific file paths", async () => {
    const result = await buildBackupCards([
      { ...card, image: "file:///cache/card.jpg" },
    ]);
    expect(result[0].image).toBeUndefined();
    expect(result[0].imageData).toBe("aW1hZ2U=");
  });

  it("does not report success for incomplete backups", async () => {
    await expect(
      buildBackupCards([{ ...card, image: "file:///cache/missing.jpg" }]),
    ).rejects.toThrow("卡面");
  });

  it("restores embedded images under fresh names, ignoring old file paths", async () => {
    const result = await restoreBackupCards({
      version: 2,
      cards: [
        { ...card, image: "file:///old-phone/card.jpg", imageData: "aW1hZ2U=" },
      ],
    });
    expect(result.cards[0].image).toBe(
      "file:///documents/cardbox-images/image-1.jpg",
    );
    expect(result.cards[0]).not.toHaveProperty("imageData");
  });

  it("removes partial files if a restore fails", async () => {
    files.write
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk full"));
    await expect(
      restoreBackupCards({
        version: 3,
        cards: [
          { ...card, imageData: "aW1hZ2U=" },
          { ...card, id: "two", imageData: "aW1hZ2U=" },
        ],
      }),
    ).rejects.toThrow("disk full");
    expect(files.remove).toHaveBeenCalledTimes(2);
  });

  it("waits for an in-flight image write before cleaning all partial files", async () => {
    let finish!: () => void;
    const writing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    files.write
      .mockImplementationOnce(() => writing)
      .mockRejectedValueOnce(new Error("disk full"));
    const result = restoreBackupCards({
      version: 3,
      cards: [
        { ...card, imageData: "aW1hZ2U=" },
        { ...card, id: "two", imageData: "aW1hZ2U=" },
      ],
    }).catch((error: Error) => error);
    await vi.waitFor(() => expect(files.write).toHaveBeenCalledTimes(2));
    expect(files.remove).not.toHaveBeenCalled();
    finish();
    expect(await result).toMatchObject({ message: "disk full" });
    expect(files.remove).toHaveBeenCalledTimes(2);
  });

  it("preserves card order while limiting concurrent image writes", async () => {
    let active = 0,
      peak = 0;
    files.write.mockImplementation(async (uri: string) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) =>
        setTimeout(resolve, uri.includes("image-1.") ? 20 : 5),
      );
      active--;
    });
    const input = Array.from({ length: 9 }, (_, index) => ({
      ...card,
      id: `card-${index}`,
      imageData: "aW1hZ2U=",
    }));
    const restored = await restoreBackupCards({ version: 3, cards: input });
    expect(restored.cards.map((card) => card.id)).toEqual(
      input.map((card) => card.id),
    );
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(files.remove).not.toHaveBeenCalled();
  });

  it("rejects path traversal IDs before touching the filesystem", async () => {
    await expect(
      restoreBackupCards({
        version: 3,
        cards: [{ ...card, id: "../escape", imageData: "aW1hZ2U=" }],
      }),
    ).rejects.toThrow();
    expect(files.write).not.toHaveBeenCalled();
  });
});
