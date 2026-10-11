import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveAndroidBackup } from "../lib/cardbox-files";

const saf = vi.hoisted(() => ({
  create: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "unused" }));
vi.mock("expo-file-system/legacy", () => ({
  EncodingType: { UTF8: "utf8" },
  StorageAccessFramework: {
    createFileAsync: saf.create,
    writeAsStringAsync: saf.write,
    readAsStringAsync: saf.read,
    deleteAsync: saf.remove,
  },
}));
const payload = '{"format":"cardbox-secure-v3","payload":"encrypted"}';
const uri = "content://test/document/backup.cardbox";
beforeEach(() => {
  saf.create.mockReset().mockResolvedValue(uri);
  saf.write.mockReset().mockResolvedValue(undefined);
  saf.read.mockReset().mockResolvedValue(payload);
  saf.remove.mockReset().mockResolvedValue(undefined);
});

describe("Android backup saving", () => {
  it("writes UTF-8 to the selected directory and verifies the saved content", async () => {
    expect(
      await saveAndroidBackup(
        "content://test/tree/selected",
        "test.cardbox",
        payload,
      ),
    ).toBe(uri);
    expect(saf.create).toHaveBeenCalledWith(
      "content://test/tree/selected",
      "test.cardbox",
      "application/octet-stream",
    );
    expect(saf.write).toHaveBeenCalledWith(uri, payload, { encoding: "utf8" });
    expect(saf.read).toHaveBeenCalledWith(uri, { encoding: "utf8" });
    expect(saf.remove).not.toHaveBeenCalled();
  });
  it("reports directory errors without removing other files", async () => {
    saf.create.mockRejectedValueOnce(new Error("permission denied"));
    await expect(
      saveAndroidBackup(
        "content://test/tree/selected",
        "test.cardbox",
        payload,
      ),
    ).rejects.toThrow("备份未保存");
    expect(saf.write).not.toHaveBeenCalled();
    expect(saf.remove).not.toHaveBeenCalled();
  });
  it("cleans only the newly created incomplete file after a write error", async () => {
    saf.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      saveAndroidBackup(
        "content://test/tree/selected",
        "test.cardbox",
        payload,
      ),
    ).rejects.toThrow("disk full");
    expect(saf.remove).toHaveBeenCalledWith(uri, { idempotent: true });
  });
  it("rejects a provider that returns empty or different data", async () => {
    saf.read.mockResolvedValueOnce("");
    await expect(
      saveAndroidBackup(
        "content://test/tree/selected",
        "test.cardbox",
        payload,
      ),
    ).rejects.toThrow("校验失败");
    expect(saf.remove).toHaveBeenCalledWith(uri, { idempotent: true });
  });
});
