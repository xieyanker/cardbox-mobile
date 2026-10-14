import * as FileSystem from "expo-file-system/legacy";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import {
  backupSchema,
  MAX_BACKUP_BYTES,
  type BackupCard,
  type Card,
} from "../shared/cardbox";
import { assertBackupCapacity, utf8Bytes } from "../shared/cardbox-backup-size";

function imageDirectory() {
  if (!FileSystem.documentDirectory) throw new Error("应用文件目录不可用。");
  return `${FileSystem.documentDirectory}cardbox-images/`;
}

/** App-container roots may change on upgrade/restore; only remap our own named images. */
export function resolveOwnedImageUri(uri: string) {
  if (Platform.OS === "web" || !FileSystem.documentDirectory) return uri;
  const match =
    /\/cardbox-images\/([a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp))$/i.exec(uri);
  return match
    ? `${FileSystem.documentDirectory}cardbox-images/${match[1]}`
    : uri;
}

async function newImagePath(extension = "jpg", preparedDirectory?: string) {
  const directory = preparedDirectory ?? imageDirectory();
  if (!preparedDirectory)
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return `${directory}${randomUUID()}.${extension}`;
}

/** Bound bridge I/O, preserve input order, and wait for all in-flight writes before rollback. */
async function mapFiles<T, R>(
  items: T[],
  action: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0,
    failed = false,
    failure: unknown;
  const workers = Array.from(
    { length: Math.min(4, items.length) },
    async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try {
          result[index] = await action(items[index]);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    },
  );
  await Promise.all(workers);
  if (failed) throw failure;
  return result;
}

export async function persistCardImage(uri: string) {
  if (Platform.OS === "web") return uri;
  uri = resolveOwnedImageUri(uri);
  if (uri.startsWith(imageDirectory())) return uri;
  const next = await newImagePath();
  try {
    await FileSystem.copyAsync({ from: uri, to: next });
  } catch (error) {
    await FileSystem.deleteAsync(next, { idempotent: true }).catch(
      () => undefined,
    );
    throw error;
  }
  return next;
}

/** Delete only direct children created by this app, after a successful card commit. */
export async function cleanupOwnedImages(previous: Card[], next: Card[]) {
  if (Platform.OS === "web") return;
  const directory = imageDirectory();
  const retained = new Set(
    next.map((card) =>
      card.image ? resolveOwnedImageUri(card.image) : undefined,
    ),
  );
  const removed = [
    ...new Set(
      previous.map((card) =>
        card.image ? resolveOwnedImageUri(card.image) : undefined,
      ),
    ),
  ].filter((uri): uri is string =>
    Boolean(
      uri &&
      uri.startsWith(directory) &&
      /^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(
        uri.slice(directory.length),
      ) &&
      !retained.has(uri),
    ),
  );
  await mapFiles(removed, async (uri) => {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  });
}

export async function imageInventory(references: (string | undefined)[]) {
  if (Platform.OS === "web")
    return { bytes: 0, files: 0, unused: [] as string[] };
  const directory = imageDirectory();
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) return { bytes: 0, files: 0, unused: [] as string[] };
  const names = (await FileSystem.readDirectoryAsync(directory)).filter(
    (name) => /^[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(name),
  );
  const retained = new Set(
    references.map((uri) => (uri ? resolveOwnedImageUri(uri) : undefined)),
  );
  const entries = await mapFiles(names, async (name) => {
    const uri = directory + name;
    const file = await FileSystem.getInfoAsync(uri);
    return { uri, size: file.exists && !file.isDirectory ? file.size : 0 };
  });
  return {
    bytes: entries.reduce((total, entry) => total + entry.size, 0),
    files: entries.length,
    unused: entries
      .filter((entry) => !retained.has(entry.uri))
      .map((entry) => entry.uri),
  };
}

export async function removeUnusedImages(references: (string | undefined)[]) {
  const inventory = await imageInventory(references);
  await mapFiles(inventory.unused, (uri) =>
    FileSystem.deleteAsync(uri, { idempotent: true }),
  );
  return inventory.unused.length;
}

export async function buildBackupCards(
  cards: Card[],
  includeImages = true,
  extraBytes = 0,
): Promise<BackupCard[]> {
  // Inspect metadata first: do not load images that cannot fit in the encrypted file.
  let estimated = extraBytes + 64;
  const baseSizes = cards.map(
    ({ image: _image, ...fields }) => utf8Bytes(JSON.stringify(fields)) + 1,
  );
  estimated += baseSizes.reduce((total, size) => total + size, 0);
  assertBackupCapacity(estimated);
  if (includeImages)
    await mapFiles(cards, async (card) => {
      if (!card.image) return;
      let bytes: number;
      if (/^data:image\/(jpeg|png|webp);base64,/.test(card.image)) {
        bytes = card.image.length - card.image.indexOf(",") - 1;
      } else {
        const uri = resolveOwnedImageUri(card.image);
        if (
          Platform.OS === "web" ||
          ![FileSystem.documentDirectory, FileSystem.cacheDirectory].some(
            (dir) => dir && uri.startsWith(dir),
          )
        )
          throw new Error(`无法备份“${card.name}”的卡面，请重新选择图片。`);
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory)
          throw new Error(
            `“${card.name}”的卡面无法读取，备份未生成。请先重新选择卡面。`,
          );
        bytes = Math.ceil(info.size / 3) * 4;
      }
      estimated += bytes + 80;
      assertBackupCapacity(estimated);
    });
  let actual =
    extraBytes + 64 + baseSizes.reduce((total, size) => total + size, 0);
  const accountImage = (size: number) => {
    actual += size + 80;
    assertBackupCapacity(actual);
  };
  const backup = await mapFiles(cards, async (card): Promise<BackupCard> => {
    if (!includeImages) return { ...card, image: undefined };
    if (!card.image) return card;
    const dataImage =
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        card.image,
      );
    if (dataImage) {
      accountImage(dataImage[2].length);
      return {
        ...card,
        image: undefined,
        imageData: dataImage[2],
        imageMime: dataImage[1] as BackupCard["imageMime"],
      };
    }
    if (Platform.OS === "web")
      throw new Error(`无法备份“${card.name}”的卡面，请重新选择图片。`);
    const imageUri = resolveOwnedImageUri(card.image);
    const allowed = [
      FileSystem.documentDirectory,
      FileSystem.cacheDirectory,
    ].some((directory) => directory && imageUri.startsWith(directory));
    if (!allowed) throw new Error(`“${card.name}”的卡面文件位置无效。`);
    let imageData: string;
    try {
      const info = await FileSystem.getInfoAsync(imageUri);
      if (!info.exists || info.isDirectory || info.size > MAX_BACKUP_BYTES)
        throw new Error("missing image");
      imageData = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      throw new Error(
        `“${card.name}”的卡面无法读取，备份未生成。请先重新选择卡面。`,
      );
    }
    accountImage(imageData.length);
    const imageMime = /\.png$/i.test(card.image)
      ? "image/png"
      : /\.webp$/i.test(card.image)
        ? "image/webp"
        : "image/jpeg";
    return { ...card, image: undefined, imageData, imageMime };
  });
  return backupSchema.parse({ version: 3, cards: backup }).cards;
}

/** New files never replace existing card images; incomplete restores are rolled back. */
export async function restoreBackupCards(
  input: unknown,
): Promise<{ cards: Card[]; discard: () => Promise<void> }> {
  const { cards } = backupSchema.parse(input);
  const created: string[] = [];
  const discard = async () => {
    await Promise.all(
      created.map((uri) =>
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(
          () => undefined,
        ),
      ),
    );
  };
  try {
    let directory: string | undefined;
    if (Platform.OS !== "web" && cards.some((card) => card.imageData)) {
      directory = imageDirectory();
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
    const restored = await mapFiles(cards, async (card): Promise<Card> => {
      const { imageData, imageMime, ...fields } = card;
      if (imageData) {
        const mime = imageMime ?? "image/jpeg";
        if (Platform.OS === "web")
          return {
            ...fields,
            image: `data:${mime};base64,${imageData}`,
          };
        else {
          const uri = await newImagePath(
            mime === "image/png"
              ? "png"
              : mime === "image/webp"
                ? "webp"
                : "jpg",
            directory,
          );
          created.push(uri);
          await FileSystem.writeAsStringAsync(uri, imageData, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { ...fields, image: uri };
        }
      } else if (
        card.image &&
        !/^data:image\/(jpeg|png|webp);base64,/.test(card.image)
      ) {
        throw new Error(`备份缺少“${card.name}”的卡面内容，无法完整恢复。`);
      } else return fields;
    });
    return { cards: restored, discard };
  } catch (error) {
    await discard();
    throw error;
  }
}

export async function readBackupFile(asset: {
  uri: string;
  size?: number;
  file?: File;
}): Promise<string> {
  const size = asset.size ?? asset.file?.size;
  if (size && size > MAX_BACKUP_BYTES) throw new Error("备份不能超过 50 MB。");
  if (Platform.OS === "web" && asset.file) return asset.file.text();
  const info = await FileSystem.getInfoAsync(asset.uri);
  if (!info.exists || info.isDirectory || info.size > MAX_BACKUP_BYTES)
    throw new Error("备份文件无效或超过 50 MB。");
  return FileSystem.readAsStringAsync(asset.uri);
}

/** Only report a saved backup after the selected provider returns identical data. */
export async function saveAndroidBackup(
  directoryUri: string,
  name: string,
  payload: string,
) {
  let uri: string | undefined;
  try {
    uri = await FileSystem.StorageAccessFramework.createFileAsync(
      directoryUri,
      name,
      "application/octet-stream",
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(uri, payload, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const saved = await FileSystem.StorageAccessFramework.readAsStringAsync(
      uri,
      {
        encoding: FileSystem.EncodingType.UTF8,
      },
    );
    if (saved !== payload) throw new Error("文件内容校验失败。");
    return uri;
  } catch (error) {
    if (uri)
      await FileSystem.StorageAccessFramework.deleteAsync(uri, {
        idempotent: true,
      }).catch(() => undefined);
    const reason = error instanceof Error ? error.message : "文件保存失败。";
    throw new Error(`备份未保存，请重新选择可写入的文件夹。${reason}`);
  }
}
