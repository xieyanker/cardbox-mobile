import { useCallback, useEffect, useMemo, useState } from "react";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { backupSchema, MAX_BACKUP_BYTES, type Card } from "../shared/cardbox";
import {
  buildBackupCards,
  readBackupFile,
  restoreBackupCards,
  saveAndroidBackup,
} from "../lib/cardbox-files";
import { cleanupPreviousImages as cleanupCardImages } from "../lib/cardbox-image-maintenance";
import { decryptBackup, encryptBackup } from "../lib/cardbox-security";
import { backupChanges } from "../lib/cardbox-backup-record";
import { preferenceSchema } from "../lib/cardbox-preferences";
import { mergeCards } from "../shared/cardbox-tools";
import { useCardboxBackupRecord } from "./use-cardbox-backup-record";
import type { useCardboxPreferences } from "./use-cardbox-preferences";
import type { useCardboxCards } from "./use-cardbox-cards";
import type { useCardboxAccess } from "./use-cardbox-access";
import type { CardboxOperations } from "./use-cardbox-operations";
import type { CardboxNavigation } from "./use-cardbox-navigation";

export function useCardboxBackup({
  storage,
  access,
  operations,
  navigation,
  preferences,
}: {
  storage: ReturnType<typeof useCardboxCards>;
  access: ReturnType<typeof useCardboxAccess>;
  operations: CardboxOperations;
  navigation: CardboxNavigation;
  preferences: ReturnType<typeof useCardboxPreferences>;
}) {
  const {
    ensureAccessible,
    authenticate,
    askConfirmation,
    notify,
    resumeAfterPicker,
    isAccessible,
  } = operations;
  const { screen, setScreen, setSelectedId, openPage } = navigation;
  const backupRecord = useCardboxBackupRecord();
  const [backupProgress, setBackupProgress] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [includeImages, setIncludeImages] = useState(true);
  const [mergeImport, setMergeImport] = useState(false);
  const [backupAsset, setBackupAsset] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const changes = useMemo(
    () => backupChanges(storage.cards, backupRecord.value),
    [storage.cards, backupRecord.value],
  );
  const clearTransient = useCallback(() => {
    setPassword("");
    setPasswordConfirmation("");
    setPasswordVisible(false);
    setBackupAsset(null);
  }, []);
  useEffect(() => {
    clearTransient();
  }, [screen, clearTransient]);
  useEffect(() => {
    // Unlocking after a system picker must not clear the file it just returned.
    if (access.locked) clearTransient();
  }, [access.locked, clearTransient]);
  const cleanupPreviousImages = (previous: Card[], next: Card[]) =>
    cleanupCardImages(storage, previous, next, notify);
  async function exportBackup() {
    if (!password.trim()) throw new Error("请输入备份密码。");
    if (password.length < 8)
      throw new Error("新备份密码请至少设置 8 位；导入旧备份仍可使用原密码。");
    if (password !== passwordConfirmation)
      throw new Error("两次备份密码不一致，请重新输入。");
    if (!backupRecord.ready)
      throw new Error("备份记录尚未读取完成，请稍后重试。");
    if (!(await authenticate("验证身份后导出全部卡片"))) return;
    setBackupProgress("正在读取卡片和图片…");
    const snapshot = await storage.read();
    const backup = await buildBackupCards(snapshot, includeImages);
    // Give the progress indicator a frame before password derivation starts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    setBackupProgress("正在加密备份，请稍候…");
    const payload = await encryptBackup(
      JSON.stringify({
        version: 3,
        cards: backup,
        preferences: preferences.ready
          ? {
              favorites: preferences.favorites,
              lastSelectedId: preferences.lastSelectedId,
              privateImages: preferences.privateImages,
            }
          : undefined,
      }),
      password,
    );
    if (payload.length > MAX_BACKUP_BYTES)
      throw new Error("备份超过 50 MB，请减少卡面图片大小。");
    ensureAccessible();
    const name = `CardBox_${new Date().toISOString().replace(/[:.]/g, "-")}.cardbox`;
    if (Platform.OS === "web") {
      const url = URL.createObjectURL(
        new Blob([payload], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else if (Platform.OS === "android") {
      setBackupProgress("请选择保存文件夹…");
      const permission =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!(await resumeAfterPicker())) {
        notify("导出已取消", "身份验证未完成，备份文件未保存。");
        return;
      }
      setScreen("export");
      if (!permission.granted) {
        notify("导出已取消", "没有选择保存文件夹，备份文件未保存。");
        return;
      }
      setBackupProgress("正在写入并校验备份文件…");
      await saveAndroidBackup(permission.directoryUri, name, payload);
    } else {
      if (!FileSystem.cacheDirectory) throw new Error("缓存目录不可用。");
      const uri = `${FileSystem.cacheDirectory}${name}`;
      await FileSystem.writeAsStringAsync(uri, payload);
      if (!(await Sharing.isAvailableAsync()))
        throw new Error("此设备暂不支持分享备份文件。");
      try {
        await Sharing.shareAsync(uri, {
          mimeType: "application/octet-stream",
          dialogTitle: "保存 CardBox 备份",
        });
      } finally {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
          () => undefined,
        );
      }
      if (!(await resumeAfterPicker())) return;
      if (
        !(await askConfirmation(
          "确认备份保存",
          "系统分享已结束，请确认备份文件已经保存到所选位置。",
        ))
      ) {
        notify("保存未确认", "备份时间记录未更新，请确认文件已保存后再备份。");
        return;
      }
    }
    setPassword("");
    setPasswordConfirmation("");
    setPasswordVisible(false);
    let recorded = true;
    await backupRecord.save(snapshot, includeImages).catch(() => {
      recorded = false;
    });
    notify(
      "备份已生成",
      `文件：${name}\n请妥善保管备份文件和密码。${recorded ? "" : "\n备份时间记录保存失败，请检查存储空间。"}`,
    );
  }

  async function chooseBackup() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !(await resumeAfterPicker())) return;
    setScreen("import");
    setBackupAsset(result.assets[0]);
  }

  async function importBackup() {
    if (!password.trim()) throw new Error("请输入备份密码。");
    if (!backupAsset) throw new Error("请先选择 .cardbox 备份文件。");
    if (!(await authenticate("验证身份后恢复卡片备份"))) return;
    setBackupProgress("正在读取备份文件…");
    const raw = await readBackupFile(backupAsset);
    await new Promise((resolve) => setTimeout(resolve, 0));
    setBackupProgress("正在验证备份密码…");
    const decrypted = await decryptBackup(raw, password);
    let input: unknown;
    try {
      input = JSON.parse(decrypted);
    } catch {
      throw new Error("密码不正确或备份已损坏。");
    }
    const parsed = backupSchema
      .extend({ preferences: preferenceSchema.optional() })
      .parse(input);
    ensureAccessible();
    const currentCards = storage.ready ? await storage.read() : [];
    const seenNumbers = new Set(
      currentCards.map((card) => card.number.replace(/\s/g, "")),
    );
    const toImport = mergeImport
      ? parsed.cards.filter((card) => {
          const number = card.number.replace(/\s/g, "");
          if (seenNumbers.has(number)) return false;
          seenNumbers.add(number);
          return true;
        })
      : parsed.cards;
    if (mergeImport && currentCards.length + toImport.length > 1000)
      throw new Error("合并后超过 1000 张卡片，请先整理卡包或选择替换方式。");
    const description = storage.ready
      ? `${mergeImport ? "合并" : "替换"}：备份中 ${parsed.cards.length} 张卡片、${parsed.cards.filter((card) => card.imageData || card.image).length} 张卡面。${mergeImport ? `新增 ${toImport.length} 张，重复卡号跳过。` : "将替换当前卡包，操作前保存加密恢复点。"}\n${parsed.cards
          .slice(0, 5)
          .map((card) => card.name)
          .join("、")}${parsed.cards.length > 5 ? "…" : ""}\n是否继续？`
      : `将恢复备份中的 ${parsed.cards.length} 张卡片。无法读取的原始数据会另存到本机，供后续排查。是否继续？`;
    setBackupProgress("");
    if (!(await askConfirmation("恢复备份", description))) return;
    ensureAccessible();
    setBackupProgress("正在恢复卡片和图片…");
    if (storage.ready)
      await storage.createRestorePoint({
        favorites: preferences.favorites,
        lastSelectedId: preferences.lastSelectedId,
        privateImages: preferences.privateImages,
      });
    const restored = await restoreBackupCards({ ...parsed, cards: toImport });
    const previous = currentCards;
    const merged = mergeImport
      ? mergeCards(previous, restored.cards, randomUUID)
      : { cards: restored.cards, added: restored.cards.length, skipped: 0 };
    try {
      ensureAccessible();
      if (storage.ready) await storage.update(() => merged.cards);
      else await storage.recover(merged.cards);
    } catch (error) {
      await restored.discard();
      throw error;
    }
    if (!isAccessible()) return;
    await cleanupPreviousImages([...previous, ...restored.cards], merged.cards);
    let preferenceWarning = "";
    if (parsed.preferences && !mergeImport) {
      await preferences
        .update((value) => ({
          ...parsed.preferences!,
          privateImages:
            value.privateImages || parsed.preferences!.privateImages,
        }))
        .catch(() => {
          preferenceWarning = "\n常用卡设置保存失败，卡片已恢复，请稍后重试。";
        });
    }
    const selected =
      !mergeImport &&
      merged.cards.some(
        (card) => card.id === parsed.preferences?.lastSelectedId,
      )
        ? parsed.preferences!.lastSelectedId
        : (merged.cards[0]?.id ?? null);
    setSelectedId(selected);
    clearTransient();
    openPage("home");
    notify(
      "恢复完成",
      mergeImport
        ? `新增 ${merged.added} 张卡片，跳过 ${parsed.cards.length - merged.added} 张重复卡片。`
        : `已恢复 ${merged.cards.length} 张卡片。${preferenceWarning}`,
    );
  }
  async function restorePreviousPack() {
    if (!(await authenticate("验证身份后恢复上次导入前卡包"))) return;
    const point = await storage.readRestorePoint();
    if (!point) throw new Error("还没有导入前恢复点。");
    if (
      !(await askConfirmation(
        "恢复上次卡包",
        `恢复导入前的 ${point.cards.length} 张卡片，将替换当前卡包，是否继续？`,
      ))
    )
      return;
    ensureAccessible();
    const previous = storage.ready ? await storage.read() : [];
    if (storage.ready) await storage.update(() => point.cards);
    else await storage.recover(point.cards);
    let preferenceWarning = "";
    if (point.preferences)
      await preferences
        .update(() => point.preferences!)
        .catch(() => {
          preferenceWarning = "常用卡设置保存失败，请稍后重试。";
        });
    await cleanupPreviousImages(previous, point.cards);
    setSelectedId(point.cards[0]?.id ?? null);
    clearTransient();
    openPage("home");
    notify("恢复完成", "已恢复上次导入前的卡包。" + preferenceWarning);
  }

  async function withProgress(action: () => Promise<void>) {
    try {
      await action();
    } finally {
      setBackupProgress("");
    }
  }
  return {
    backupRecord,
    changes,
    backupProgress,
    password,
    setPassword,
    passwordVisible,
    setPasswordVisible,
    passwordConfirmation,
    setPasswordConfirmation,
    includeImages,
    setIncludeImages,
    mergeImport,
    setMergeImport,
    backupAsset,
    clearTransient,
    chooseBackup,
    exportBackup: () => withProgress(exportBackup),
    importBackup: () => withProgress(importBackup),
    restorePreviousPack: () => withProgress(restorePreviousPack),
  };
}
export type CardboxBackup = ReturnType<typeof useCardboxBackup>;
