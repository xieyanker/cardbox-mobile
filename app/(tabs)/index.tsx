import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { z } from "zod";
import { SafeAreaView } from "react-native-safe-area-context";
import { CardFace } from "@/components/cardbox/card-face";
import {
  BrowseModePicker,
  CardBrowser,
} from "@/components/cardbox/card-browser";
import { CardDetails } from "@/components/cardbox/card-details";
import { CardEditor } from "@/components/cardbox/card-editor";
import { useCardboxStyles } from "@/components/cardbox/styles";
import { useCardboxAccess } from "@/hooks/use-cardbox-access";
import { useCardboxCards } from "@/hooks/use-cardbox-cards";
import { useCardboxBrowse } from "@/hooks/use-cardbox-browse";
import { useCardboxPreferences } from "@/hooks/use-cardbox-preferences";
import { CardGrid } from "@/components/cardbox/card-grid";
import { CardSort } from "@/components/cardbox/card-sort";
import { filterCards, moveCardTo, mergeCards } from "@/shared/cardbox-tools";
import { BackupPanel } from "@/components/cardbox/backup-panel";
import { useCardboxBackupRecord } from "@/hooks/use-cardbox-backup-record";
import { backupChanges } from "@/lib/cardbox-backup-record";
import { preferenceSchema } from "@/lib/cardbox-preferences";
import { CardImageEditor } from "@/components/cardbox/card-image-editor";
import type { CropSource } from "@/shared/cardbox-crop";
import {
  buildBackupCards,
  cleanupOwnedImages,
  persistCardImage,
  readBackupFile,
  restoreBackupCards,
  saveAndroidBackup,
  imageInventory,
  removeUnusedImages,
} from "@/lib/cardbox-files";
import { decryptBackup, encryptBackup } from "@/lib/cardbox-security";
import { APP_AUTHOR, APP_REPOSITORY_URL, APP_VERSION } from "@/shared/app-info";
import { BROWSE_MODES, DEFAULT_BROWSE_ORDER } from "@/shared/cardbox-browse";
import {
  CARD_TONES,
  CARD_TYPES,
  backupSchema,
  MAX_BACKUP_BYTES,
  lockTimeoutLabel,
  validateCardDraft,
  type Card,
} from "@/shared/cardbox";

type Screen =
  | "home"
  | "details"
  | "all"
  | "editor"
  | "sort"
  | "export"
  | "import"
  | "settings"
  | "browse-settings"
  | "storage"
  | "about";
type Confirmation = {
  title: string;
  description: string;
  resolve: (value: boolean) => void;
};
type BackupAsset = DocumentPicker.DocumentPickerAsset;

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return "卡片或备份格式无效，原数据未修改。";
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

export default function HomeScreen() {
  const { styles, colors } = useCardboxStyles();
  const storage = useCardboxCards();
  const access = useCardboxAccess();
  const browse = useCardboxBrowse();
  const preferences = useCardboxPreferences();
  const updatePreferences = preferences.update;
  const hidePhotos = !preferences.ready || preferences.privateImages;
  const backupRecord = useCardboxBackupRecord();
  const [selectionReady, setSelectionReady] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const [draft, setDraft] = useState<Card | null>(null);
  const initialDraft = useRef<Card | null>(null);
  const [leaveEditor, setLeaveEditor] = useState(false);
  const suspendedDraft = useRef<{
    draft: Card;
    pendingImage: CropSource | null;
  } | null>(null);
  const [pendingImage, setPendingImage] = useState<CropSource | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [includeImages, setIncludeImages] = useState(true);
  const [mergeImport, setMergeImport] = useState(false);
  const [inventory, setInventory] = useState<{
    bytes: number;
    files: number;
    unused: string[];
  } | null>(null);
  const changes = useMemo(
    () => backupChanges(storage.cards, backupRecord.value),
    [storage.cards, backupRecord.value],
  );
  const [backupAsset, setBackupAsset] = useState<BackupAsset | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const workingRef = useRef(false);
  const confirmationRef = useRef<Confirmation | null>(null);
  confirmationRef.current = confirmation;
  const accessRef = useRef(access);
  accessRef.current = access;
  const cards = storage.cards;
  const selectedIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedId),
  );
  const current = cards[selectedIndex];
  const filtered = useMemo(
    () =>
      filterCards(
        cards,
        query,
        typeFilter,
        preferences.favorites,
        onlyFavorites,
      ),
    [cards, query, typeFilter, preferences.favorites, onlyFavorites],
  );
  const busy = working || storage.busy || access.authenticating;
  const showSensitive = Boolean(
    current &&
    revealed?.id === current.id &&
    revealed.version === access.privacyVersion,
  );
  useEffect(() => {
    if (!selectionReady && storage.ready && preferences.ready) {
      if (cards.some((card) => card.id === preferences.lastSelectedId))
        setSelectedId(preferences.lastSelectedId);
      setSelectionReady(true);
    }
  }, [
    selectionReady,
    storage.ready,
    preferences.ready,
    preferences.lastSelectedId,
    cards,
  ]);
  const lastRemembered = useRef<string | null>(null);
  useEffect(() => {
    if (!selectionReady || !current || lastRemembered.current === current.id)
      return;
    lastRemembered.current = current.id;
    void updatePreferences((value) => ({
      ...value,
      lastSelectedId: current.id,
    })).catch(() => {
      lastRemembered.current = null;
      notify("浏览位置未保存", "请检查存储空间后重试。");
    });
  }, [selectionReady, current, updatePreferences]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 30_000);
    return () => clearTimeout(timer);
  }, [revealed]);

  const closeTransientState = useCallback(() => {
    setNotice(null);
    setRevealed(null);
    setDraft(null);
    initialDraft.current = null;
    suspendedDraft.current = null;
    setLeaveEditor(false);
    setPendingImage(null);
    setPassword("");
    setPasswordConfirmation("");
    setPasswordVisible(false);
    setBackupAsset(null);
    setMenuOpen(false);
    setBackupMenuOpen(false);
    confirmationRef.current?.resolve(false);
    setConfirmation(null);
    setScreen("home");
  }, []);

  useEffect(() => {
    if (access.locked) {
      if (draft) suspendedDraft.current = { draft, pendingImage };
      setRevealed(null);
      setPassword("");
      setPasswordConfirmation("");
      setPasswordVisible(false);
      setBackupAsset(null);
      setMenuOpen(false);
      setBackupMenuOpen(false);
      confirmationRef.current?.resolve(false);
      setConfirmation(null);
      setLeaveEditor(false);
    } else if (suspendedDraft.current) {
      setDraft(suspendedDraft.current.draft);
      setPendingImage(suspendedDraft.current.pendingImage);
      setScreen("editor");
      suspendedDraft.current = null;
    }
  }, [access.locked, draft, pendingImage]);

  const requestBack = useCallback(() => {
    if (workingRef.current) return;
    if (
      screen === "editor" &&
      draft &&
      JSON.stringify(draft) !== JSON.stringify(initialDraft.current)
    ) {
      setLeaveEditor(true);
    } else closeTransientState();
  }, [screen, draft, closeTransientState]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (confirmationRef.current) {
          confirmationRef.current.resolve(false);
          setConfirmation(null);
          return true;
        }
        if (leaveEditor) {
          setLeaveEditor(false);
          return true;
        }
        if (pendingImage) {
          setPendingImage(null);
          return true;
        }
        if (menuOpen) {
          if (backupMenuOpen) {
            setBackupMenuOpen(false);
            return true;
          }
          setMenuOpen(false);
          return true;
        }
        if (screen !== "home") {
          requestBack();
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [
    screen,
    menuOpen,
    backupMenuOpen,
    pendingImage,
    requestBack,
    leaveEditor,
  ]);

  async function run(action: () => Promise<void>) {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      notify("操作未完成", errorMessage(error));
    } finally {
      workingRef.current = false;
      setWorking(false);
      setBackupProgress("");
    }
  }

  function notify(title: string, description: string) {
    if (Platform.OS === "web") setNotice({ title, description });
    else Alert.alert(title, description);
  }

  function ensureAccessible() {
    if (!accessRef.current.isAccessible())
      throw new Error("应用已锁定，请解锁后重新操作。");
  }

  async function authenticate(reason: string) {
    const success = await accessRef.current.authenticate(reason);
    return success && accessRef.current.isAccessible();
  }

  async function resumeAfterPicker() {
    if (!(await accessRef.current.waitForForeground()))
      throw new Error("应用尚未恢复到前台，请解锁后重试。");
    // An external system picker can outlast the automatic lock timeout.
    if (
      accessRef.current.snapshot().locked &&
      !(await accessRef.current.unlock())
    )
      return false;
    return accessRef.current.isAccessible();
  }

  function chooseCard(id: string) {
    if (busy) return;
    setSelectedId(id);
    setRevealed(null);
    setScreen("home");
  }

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !busy &&
          Math.abs(gesture.dx) > 14 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) < 45 || cards.length < 2 || busy) return;
          const index =
            (selectedIndex + (gesture.dx < 0 ? 1 : cards.length - 1)) %
            cards.length;
          setSelectedId(cards[index].id);
          setRevealed(null);
        },
      }),
    [busy, cards, selectedIndex],
  );

  function askConfirmation(title: string, description: string) {
    return new Promise<boolean>((resolve) => {
      const next = { title, description, resolve };
      confirmationRef.current = next;
      setConfirmation(next);
    });
  }

  function startNew() {
    ensureAccessible();
    setMenuOpen(false);
    setBackupMenuOpen(false);
    setRevealed(null);
    const next: Card = {
      id: randomUUID(),
      name: "",
      number: "",
      cvv: "",
      expiry: "",
      note: "",
      tone: CARD_TONES[cards.length % CARD_TONES.length],
      type: "debit",
    };
    initialDraft.current = next;
    setDraft(next);
    setScreen("editor");
  }

  async function editCurrent() {
    if (!current || !(await authenticate("验证身份后编辑卡片"))) return;
    setRevealed(null);
    initialDraft.current = { ...current };
    setDraft({ ...current });
    setScreen("editor");
  }

  async function saveDraft() {
    if (!draft) return;
    ensureAccessible();
    const validation = validateCardDraft(draft);
    if (validation) throw new Error(validation);
    const duplicate = cards.find(
      (card) =>
        card.id !== draft.id &&
        card.number.replace(/\s/g, "") === draft.number.replace(/\s/g, ""),
    );
    if (
      duplicate &&
      !(await askConfirmation(
        "卡号重复",
        `已有“${duplicate.name}”使用这个卡号，仍然保存吗？`,
      ))
    )
      return;
    ensureAccessible();
    const saved: Card = {
      ...draft,
      name: draft.name.trim(),
      number: draft.number.replace(/\s/g, ""),
    };
    const originalImage = saved.image;
    const previous = await storage.read();
    if (saved.image) saved.image = await persistCardImage(saved.image);
    try {
      ensureAccessible();
      await storage.update((previous) =>
        previous.some((card) => card.id === saved.id)
          ? previous.map((card) => (card.id === saved.id ? saved : card))
          : [...previous, saved],
      );
    } catch (error) {
      if (saved.image !== originalImage && saved.image)
        await discardOwnedImage(saved.image);
      throw error;
    }
    if (!accessRef.current.isAccessible()) return;
    await cleanupPreviousImages(previous, await storage.read());
    setSelectedId(saved.id);
    setDraft(null);
    suspendedDraft.current = null;
    setScreen("home");
  }

  async function discardOwnedImage(uri: string) {
    const directory =
      FileSystem.documentDirectory &&
      `${FileSystem.documentDirectory}cardbox-images/`;
    if (directory && uri.startsWith(directory))
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(
        () => undefined,
      );
  }
  async function cleanupPreviousImages(previous: Card[], next: Card[]) {
    try {
      const point = await storage.readRestorePoint();
      await cleanupOwnedImages(previous, [...next, ...(point?.cards ?? [])]);
    } catch {
      notify("数据已保存", "旧图片暂未清理，恢复点与卡包已保留，请稍后重试。");
    }
  }
  async function loadInventory(clean = false) {
    ensureAccessible();
    const point = await storage.readRestorePoint();
    const references = [...(await storage.read()), ...(point?.cards ?? [])].map(
      (card) => card.image,
    );
    if (draft?.image) references.push(draft.image);
    if (clean) {
      if (
        !(await askConfirmation(
          "清理无用卡面",
          "仅删除没有被当前卡包或导入恢复点引用的应用自有图片，是否继续？",
        ))
      )
        return;
      ensureAccessible();
      await removeUnusedImages(references);
    }
    setInventory(await imageInventory(references));
  }

  async function chooseImage() {
    if (!draft) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      throw new Error("请允许访问相册，以选择卡面图片。");
    if (!(await resumeAfterPicker())) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0] || !(await resumeAfterPicker()))
      return;
    const image = result.assets[0];
    ensureAccessible();
    setDraft((previous) => previous ?? draft);
    setScreen("editor");
    setPendingImage({
      uri: image.uri,
      width: image.width,
      height: image.height,
    });
  }

  async function deleteCurrent() {
    if (!current || !(await authenticate("验证身份后删除卡片"))) return;
    if (
      !(await askConfirmation(
        "删除卡片",
        `确定删除“${current.name}”？此操作无法撤销。`,
      ))
    )
      return;
    ensureAccessible();
    const next = await storage.update((previous) =>
      previous.filter((card) => card.id !== current.id),
    );
    await cleanupPreviousImages([current], next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? null);
    setRevealed(null);
  }

  async function toggleSensitive() {
    if (!current) return;
    if (showSensitive) {
      setRevealed(null);
      return;
    }
    if (await authenticate("验证身份后显示卡片信息"))
      setRevealed({
        id: current.id,
        version: accessRef.current.snapshot().privacyVersion,
      });
  }

  async function reorderTo(id: string, target: number) {
    ensureAccessible();
    await storage.update((previous) => moveCardTo(previous, id, target));
  }
  async function copyField(field: "number" | "cvv") {
    if (!current || !(await authenticate("验证身份后复制卡片信息"))) return;
    ensureAccessible();
    const copied = await Clipboard.setStringAsync(
      current[field].replace(/\s/g, ""),
    );
    if (!copied) throw new Error("复制失败，请检查剪贴板权限。");
    notify("复制成功", field === "number" ? "卡号已复制。" : "CVV 已复制。");
  }

  function openPage(page: Screen) {
    setNotice(null);
    setMenuOpen(false);
    setBackupMenuOpen(false);
    setPassword("");
    setPasswordConfirmation("");
    setPasswordVisible(false);
    setBackupAsset(null);
    setRevealed(null);
    setScreen(page);
  }

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
    if (!accessRef.current.isAccessible()) return;
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
    closeTransientState();
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
    closeTransientState();
    notify("恢复完成", "已恢复上次导入前的卡包。" + preferenceWarning);
  }

  const titles: Record<Screen, string> = {
    home: "CardBox",
    details: "卡片详情",
    all: "全部卡片",
    editor: cards.some((card) => card.id === draft?.id)
      ? "编辑卡片"
      : "添加卡片",
    sort: "卡片排序",
    export: "导出备份",
    import: "导入备份",
    settings: "自动锁定",
    "browse-settings": "浏览模式",
    about: "关于应用",
    storage: "存储管理",
  };
  const icon = (
    name: React.ComponentProps<typeof Ionicons>["name"],
    size = 22,
  ) => <Ionicons name={name} size={size} color={colors.primary} />;
  const unlock = () =>
    void run(async () => {
      await access.unlock();
    });

  const cardDetails = current && (
    <CardDetails
      card={current}
      showSensitive={showSensitive}
      disabled={busy}
      onToggleSensitive={() => void run(toggleSensitive)}
      onEdit={() => void run(editCurrent)}
      onDelete={() => void run(deleteCurrent)}
      favorite={preferences.favorites.includes(current.id)}
      onFavorite={() =>
        void run(() =>
          preferences.update((value) => ({
            ...value,
            favorites: value.favorites.includes(current.id)
              ? value.favorites.filter((id) => id !== current.id)
              : [...value.favorites, current.id],
          })),
        )
      }
      onCopy={(field) => void run(() => copyField(field))}
    />
  );
  const cardNavigation = current && (
    <View style={[styles.spaced, { justifyContent: "center" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled:
            busy ||
            cards.length < 2 ||
            (browse.mode !== "classic" && selectedIndex === 0),
        }}
        disabled={
          busy ||
          cards.length < 2 ||
          (browse.mode !== "classic" && selectedIndex === 0)
        }
        style={styles.iconButton}
        accessibilityLabel="上一张卡片"
        onPress={() =>
          chooseCard(
            cards[
              browse.mode === "classic"
                ? (selectedIndex + cards.length - 1) % cards.length
                : Math.max(0, selectedIndex - 1)
            ].id,
          )
        }
      >
        {icon(browse.mode === "classic" ? "chevron-back" : "chevron-up", 17)}
      </Pressable>
      <Text style={styles.counter}>
        {selectedIndex + 1} / {cards.length}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{
          disabled:
            busy ||
            cards.length < 2 ||
            (browse.mode !== "classic" && selectedIndex === cards.length - 1),
        }}
        disabled={
          busy ||
          cards.length < 2 ||
          (browse.mode !== "classic" && selectedIndex === cards.length - 1)
        }
        style={styles.iconButton}
        accessibilityLabel="下一张卡片"
        onPress={() =>
          chooseCard(
            cards[
              browse.mode === "classic"
                ? (selectedIndex + 1) % cards.length
                : Math.min(cards.length - 1, selectedIndex + 1)
            ].id,
          )
        }
      >
        {icon(
          browse.mode === "classic" ? "chevron-forward" : "chevron-down",
          17,
        )}
      </Pressable>
    </View>
  );

  if (access.locked || access.obscured) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.empty}>
          {icon("lock-closed-outline", 52)}
          <Text style={styles.heading}>CardBox 已锁定</Text>
          <Text style={[styles.muted, styles.centerText]}>
            验证身份后查看和管理卡片
          </Text>
          {!access.obscured && (
            <Pressable
              disabled={busy}
              onPress={unlock}
              style={[styles.primary, busy && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {busy ? "正在验证…" : "指纹 / 锁屏密码解锁"}
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (!storage.ready && screen !== "import") {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.empty}>
          {storage.error ? (
            <>
              <Text style={styles.heading}>卡片暂时无法读取</Text>
              <Text style={[styles.muted, styles.centerText]}>
                {storage.error}
              </Text>
              <Pressable
                style={styles.primary}
                onPress={() => void storage.reload()}
              >
                <Text style={styles.primaryText}>重新读取</Text>
              </Pressable>
              <Pressable
                style={styles.iconButton}
                onPress={() => openPage("import")}
              >
                <Text style={styles.outlineText}>使用加密备份恢复</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.muted}>正在读取卡片…</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.page}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={styles.header}>
        <View style={styles.headerGroup}>
          {screen !== "home" && (
            <Pressable
              disabled={busy}
              style={styles.iconButton}
              onPress={requestBack}
              accessibilityLabel="返回首页"
            >
              {icon("chevron-back")}
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={1}>
            {titles[screen]}
          </Text>
        </View>
        {working && (
          <ActivityIndicator
            color={colors.primary}
            style={{ marginRight: 8 }}
          />
        )}
        {screen === "home" && (
          <>
            <Pressable
              disabled={busy}
              style={styles.iconButton}
              onPress={() => openPage("all")}
              accessibilityLabel="全部卡片"
            >
              {icon("grid-outline")}
            </Pressable>
            <Pressable
              disabled={busy}
              style={styles.iconButton}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="更多菜单"
            >
              {icon("ellipsis-vertical")}
            </Pressable>
          </>
        )}
        {screen === "all" && (
          <Pressable
            disabled={busy}
            style={styles.iconButton}
            onPress={() => openPage("sort")}
            accessibilityLabel="排序管理"
          >
            {icon("swap-vertical-outline")}
          </Pressable>
        )}
        {screen === "editor" && (
          <Pressable
            disabled={busy}
            style={styles.iconButton}
            onPress={() => void run(saveDraft)}
            accessibilityLabel="保存卡片"
          >
            {icon("checkmark")}
          </Pressable>
        )}
      </View>

      {notice && (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.surface, { marginHorizontal: 22, marginBottom: 8 }]}
        >
          <View style={styles.spaced}>
            <Text style={styles.gridName}>{notice.title}</Text>
            <Pressable
              accessibilityLabel="关闭提示"
              style={styles.iconButton}
              onPress={() => setNotice(null)}
            >
              {icon("close", 18)}
            </Pressable>
          </View>
          <Text style={styles.text}>{notice.description}</Text>
        </View>
      )}

      {screen === "home" && current && (
        <BrowseModePicker
          mode={browse.mode}
          order={browse.order}
          disabled={busy}
          onChange={(mode) => {
            setRevealed(null);
            void run(() => browse.selectMode(mode));
          }}
        />
      )}
      {screen === "home" &&
        (current ? (
          browse.mode === "classic" ? (
            <ScrollView contentContainerStyle={styles.content}>
              <View {...swipe.panHandlers}>
                <CardFace
                  card={current}
                  hideImage={hidePhotos && !showSensitive}
                />
              </View>
              {cardNavigation}
              {cardDetails}
            </ScrollView>
          ) : (
            <View style={styles.grow}>
              <CardBrowser
                hideImages={hidePhotos}
                cards={cards}
                selectedIndex={selectedIndex}
                mode={browse.mode}
                disabled={busy}
                onSelect={chooseCard}
                onOpen={() => {
                  setRevealed(null);
                  setScreen("details");
                }}
              />
              {cardNavigation}
              <View
                style={[
                  styles.surface,
                  { marginHorizontal: 22, marginBottom: 16, padding: 14 },
                ]}
              >
                <View style={styles.spaced}>
                  <View style={styles.grow}>
                    <Text style={styles.gridName} numberOfLines={1}>
                      {current.name}
                    </Text>
                    <Text style={styles.muted}>{CARD_TYPES[current.type]}</Text>
                  </View>
                  <Pressable
                    disabled={busy}
                    style={styles.iconButton}
                    accessibilityLabel="查看卡片详情"
                    onPress={() => {
                      setRevealed(null);
                      setScreen("details");
                    }}
                  >
                    <Text style={styles.outlineText}>查看详情</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )
        ) : (
          <View style={styles.empty}>
            {icon("wallet-outline", 68)}
            <Text style={styles.heading}>还没有卡片</Text>
            <Text style={[styles.muted, styles.centerText]}>
              从右上角菜单选择“添加卡片”{"\n"}开始建立你的专属卡包
            </Text>
          </View>
        ))}
      {screen === "details" && current && (
        <ScrollView contentContainerStyle={styles.content}>
          <CardFace card={current} hideImage={hidePhotos && !showSensitive} />
          {cardDetails}
        </ScrollView>
      )}

      {screen === "all" && (
        <View style={styles.grow}>
          <View style={[styles.surface, { marginHorizontal: 22, padding: 12 }]}>
            <TextInput
              accessibilityLabel="搜索卡片"
              value={query}
              onChangeText={setQuery}
              placeholder="搜索名称或卡号后四位"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCorrect={false}
            />
            <View style={styles.choices}>
              {[["all", "全部"], ...Object.entries(CARD_TYPES)].map(
                ([type, name]) => (
                  <Pressable
                    key={type}
                    accessibilityRole="radio"
                    accessibilityLabel={name + "筛选"}
                    accessibilityState={{ checked: typeFilter === type }}
                    onPress={() => setTypeFilter(type)}
                    style={[
                      styles.choice,
                      typeFilter === type && styles.selectedChoice,
                    ]}
                  >
                    <Text
                      style={
                        typeFilter === type ? styles.outlineText : styles.muted
                      }
                    >
                      {name}
                    </Text>
                  </Pressable>
                ),
              )}
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel="只看常用卡"
                accessibilityState={{ checked: onlyFavorites }}
                onPress={() => setOnlyFavorites(!onlyFavorites)}
                style={[styles.choice, onlyFavorites && styles.selectedChoice]}
              >
                <Text style={styles.outlineText}>★ 常用</Text>
              </Pressable>
            </View>
            <Text style={styles.muted}>
              找到 {filtered.length} 张卡片 · 常用卡置顶
            </Text>
            {preferences.error ? (
              <Text style={styles.error}>{preferences.error}</Text>
            ) : null}
          </View>
          <CardGrid
            cards={filtered}
            favorites={preferences.favorites}
            privateImages={hidePhotos}
            busy={busy}
            onSelect={chooseCard}
          />
        </View>
      )}

      {screen === "sort" && (
        <CardSort
          hideImages={hidePhotos}
          cards={cards}
          busy={busy}
          onMove={(id, target) => void run(() => reorderTo(id, target))}
        />
      )}

      {screen === "editor" && draft && (
        <CardEditor
          card={draft}
          onChange={setDraft}
          onPickImage={() => void run(chooseImage)}
          onRemoveImage={() =>
            setDraft((previous) =>
              previous ? { ...previous, image: undefined } : previous,
            )
          }
          busy={busy}
        />
      )}

      {(screen === "export" || screen === "import") && (
        <BackupPanel
          importing={screen === "import"}
          busy={busy}
          working={working}
          progress={backupProgress}
          password={password}
          onPassword={setPassword}
          confirmation={passwordConfirmation}
          onConfirmation={setPasswordConfirmation}
          visible={passwordVisible}
          onVisible={() => setPasswordVisible(!passwordVisible)}
          assetName={backupAsset?.name}
          onChoose={() => void run(chooseBackup)}
          onSubmit={() =>
            void run(screen === "export" ? exportBackup : importBackup)
          }
          record={backupRecord.value}
          changes={changes}
          includeImages={includeImages}
          onImages={() => setIncludeImages(!includeImages)}
          merge={mergeImport}
          onMerge={setMergeImport}
          onRestorePoint={() => void run(restorePreviousPack)}
        />
      )}

      {screen === "browse-settings" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.muted}>
            调整首页显示模式的顺序，修改后自动保存。
          </Text>
          {browse.order.map((mode, index) => (
            <View key={mode} style={styles.surface}>
              <View style={styles.spaced}>
                <Text style={[styles.text, styles.grow]}>
                  {index + 1}. {BROWSE_MODES[mode]}
                </Text>
                {([-1, 1] as const).map((direction) => {
                  const disabled =
                    busy ||
                    index + direction < 0 ||
                    index + direction >= browse.order.length;
                  return (
                    <Pressable
                      key={direction}
                      accessibilityRole="button"
                      accessibilityState={{ disabled }}
                      accessibilityLabel={`${direction < 0 ? "上移" : "下移"}${BROWSE_MODES[mode]}模式`}
                      disabled={disabled}
                      style={[styles.iconButton, disabled && styles.disabled]}
                      onPress={() => {
                        const next = [...browse.order];
                        [next[index], next[index + direction]] = [
                          next[index + direction],
                          next[index],
                        ];
                        void run(() => browse.saveOrder(next));
                      }}
                    >
                      {icon(direction < 0 ? "arrow-up" : "arrow-down", 20)}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
          <Pressable
            accessibilityLabel="恢复默认模式顺序"
            disabled={busy}
            style={styles.outline}
            onPress={() =>
              void run(() => browse.saveOrder([...DEFAULT_BROWSE_ORDER]))
            }
          >
            <Text style={styles.outlineText}>恢复默认顺序</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === "settings" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.muted}>
            应用切到后台后，超过设定时间需要重新验证身份。冷启动始终需要验证。
          </Text>
          {[1, 60_000, 300_000, 0].map((timeout) => (
            <Pressable
              key={timeout}
              disabled={busy || !access.settingsReady}
              style={styles.surface}
              onPress={() =>
                void run(async () => {
                  if (await authenticate("验证身份后修改自动锁定设置"))
                    await access.setTimeout(timeout);
                })
              }
            >
              <View style={styles.spaced}>
                <Text style={styles.text}>{lockTimeoutLabel(timeout)}</Text>
                {access.timeout === timeout && icon("checkmark-circle")}
              </View>
            </Pressable>
          ))}
          <Pressable
            disabled={busy || !preferences.ready}
            accessibilityRole="switch"
            accessibilityLabel="照片隐私模式"
            accessibilityState={{ checked: preferences.privateImages }}
            style={styles.surface}
            onPress={() =>
              void run(() =>
                preferences.update((value) => ({
                  ...value,
                  privateImages: !value.privateImages,
                })),
              )
            }
          >
            <Text style={styles.text}>
              照片隐私模式：{preferences.privateImages ? "开启" : "关闭"}
            </Text>
            <Text style={styles.muted}>
              开启后隐藏原始卡面照片，验证并显示敏感信息时才在详情中展示。敏感信息
              30 秒后自动隐藏。
            </Text>
          </Pressable>
          <Pressable
            disabled={busy}
            style={styles.primary}
            accessibilityLabel="立即锁定"
            onPress={() => access.lock()}
          >
            <Text style={styles.primaryText}>立即锁定</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === "about" && (
        <View style={styles.empty}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={{ width: 112, height: 112, borderRadius: 24 }}
            accessibilityLabel="CardBox 应用图标"
          />
          <Text style={styles.heading}>CardBox</Text>
          <Text style={styles.text}>版本 {APP_VERSION}</Text>
          <Text style={styles.text}>作者：{APP_AUTHOR}</Text>
          <Text style={styles.muted}>简单 · 安全 · 纯本地</Text>
          <Text style={[styles.muted, styles.centerText]}>
            卡片资料保存在本机，无需账号。{"\n"}请定期导出加密备份。
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="打开 GitHub 项目"
            style={styles.iconButton}
            onPress={() =>
              void run(async () => {
                await Linking.openURL(APP_REPOSITORY_URL);
              })
            }
          >
            <Text style={styles.outlineText}>GitHub 项目</Text>
            <Text selectable style={[styles.muted, styles.centerText]}>
              {APP_REPOSITORY_URL}
            </Text>
          </Pressable>
        </View>
      )}

      {screen === "storage" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>卡面存储</Text>
          <Text style={styles.muted}>
            {Platform.OS === "web"
              ? "Web 卡面保存在加密卡包中；原生应用可查看私有图片目录占用。"
              : "清理会保留当前卡包和导入恢复点中的图片。"}
          </Text>
          {inventory && (
            <Text style={styles.text}>
              {inventory.files} 个图片文件 ·{" "}
              {(inventory.bytes / 1024 / 1024).toFixed(2)} MB ·{" "}
              {inventory.unused.length} 个无引用文件
            </Text>
          )}
          <Pressable
            disabled={busy}
            style={styles.primary}
            onPress={() => void run(() => loadInventory())}
          >
            <Text style={styles.primaryText}>查看存储占用</Text>
          </Pressable>
          <Pressable
            disabled={busy || Platform.OS === "web"}
            style={styles.outline}
            onPress={() => void run(() => loadInventory(true))}
          >
            <Text style={styles.outlineText}>清理无用卡面</Text>
          </Pressable>
        </ScrollView>
      )}

      {screen === "all" && (
        <Pressable
          disabled={busy}
          onPress={() => void run(async () => startNew())}
          style={[styles.fab, busy && styles.disabled]}
          accessibilityLabel="添加卡片"
        >
          <Ionicons name="add" size={30} color="white" />
        </Pressable>
      )}

      {menuOpen && (
        <View style={styles.backdrop}>
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              setMenuOpen(false);
              setBackupMenuOpen(false);
            }}
            accessibilityLabel="关闭菜单"
          />
          <View style={styles.menu}>
            {backupMenuOpen && (
              <Pressable
                style={[styles.menuItem, styles.submenuHeading]}
                onPress={() => setBackupMenuOpen(false)}
                accessibilityLabel="返回一级菜单"
              >
                {icon("chevron-back", 18)}
                <Text style={styles.text}>备份管理</Text>
              </Pressable>
            )}
            {(backupMenuOpen
              ? ([
                  ["export", "cloud-upload-outline", "导出备份"],
                  ["import", "cloud-download-outline", "导入备份"],
                ] as const)
              : ([
                  ["add", "add-outline", "添加卡片"],
                  ["sort", "swap-vertical-outline", "卡片排序"],
                  ["backup", "folder-open-outline", "备份管理"],
                  ["settings", "lock-closed-outline", "自动锁定"],
                  ["lock", "lock-closed", "立即锁定"],
                  ["browse-settings", "options-outline", "浏览模式"],
                  ["storage", "folder-outline", "存储管理"],
                  ["about", "information-circle-outline", "关于应用"],
                ] as const)
            ).map(([page, name, label]) => (
              <Pressable
                key={page}
                accessibilityLabel={label}
                disabled={busy}
                style={styles.menuItem}
                onPress={() => {
                  if (page === "add") void run(async () => startNew());
                  else if (page === "lock") access.lock();
                  else if (page === "backup") setBackupMenuOpen(true);
                  else openPage(page);
                }}
              >
                {icon(name, 18)}
                <Text style={[styles.text, styles.grow]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {pendingImage && (
        <CardImageEditor
          key={pendingImage.uri}
          source={pendingImage}
          onConfirm={(uri) => {
            ensureAccessible();
            setDraft((previous) =>
              previous ? { ...previous, image: uri } : previous,
            );
            setPendingImage(null);
          }}
          onCancel={() => setPendingImage(null)}
          onChoose={() => {
            setPendingImage(null);
            void run(chooseImage);
          }}
          onError={(message) => notify("卡面未完成", message)}
        />
      )}

      {leaveEditor && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>尚未保存</Text>
            <Text style={styles.muted}>卡片内容已修改，离开前是否保存？</Text>
            <Pressable
              disabled={busy}
              style={styles.primary}
              onPress={() => {
                setLeaveEditor(false);
                void run(saveDraft);
              }}
            >
              <Text style={styles.primaryText}>保存修改</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              style={styles.destructive}
              onPress={closeTransientState}
            >
              <Text style={styles.destructiveText}>放弃修改</Text>
            </Pressable>
            <Pressable
              style={styles.outline}
              onPress={() => setLeaveEditor(false)}
            >
              <Text style={styles.outlineText}>继续编辑</Text>
            </Pressable>
          </View>
        </View>
      )}

      {confirmation && (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{confirmation.title}</Text>
            <Text style={styles.muted}>{confirmation.description}</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.outline}
                onPress={() => {
                  confirmation.resolve(false);
                  setConfirmation(null);
                }}
              >
                <Text style={styles.outlineText}>取消</Text>
              </Pressable>
              <Pressable
                style={styles.destructive}
                onPress={() => {
                  confirmation.resolve(true);
                  setConfirmation(null);
                }}
              >
                <Text style={styles.destructiveText}>确认</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}
