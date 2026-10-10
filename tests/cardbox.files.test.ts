import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBackupCards,
  persistCardImage,
  restoreBackupCards,
} from "../lib/cardbox-files";
import type { Card } from "../shared/cardbox";

const files = vi.hoisted(() => ({
  write: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
  counter: 0,
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
    size: 20,
  }),
  readAsStringAsync: async () => "aW1hZ2U=",
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
  files.write.mockReset().mockResolvedValue(undefined);
  files.remove.mockReset().mockResolvedValue(undefined);
  files.copy.mockReset().mockResolvedValue(undefined);
});

describe("card images and backup restores", () => {
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
