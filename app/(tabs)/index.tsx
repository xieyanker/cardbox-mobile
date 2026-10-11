import { Ionicons } from "@expo/vector-icons";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
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
import {
  buildBackupCards,
  persistCardImage,
  readBackupFile,
  restoreBackupCards,
  saveAndroidBackup,
} from "@/lib/cardbox-files";
import { decryptBackup, encryptBackup } from "@/lib/cardbox-security";
import { APP_AUTHOR, APP_REPOSITORY_URL, APP_VERSION } from "@/shared/app-info";
import {
  CARD_TONES,
  CARD_TYPES,
  backupSchema,
  MAX_BACKUP_BYTES,
  lockTimeoutLabel,
  moveCard,
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
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const [draft, setDraft] = useState<Card | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
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
  const busy = working || storage.busy || access.authenticating;
  const showSensitive = Boolean(
    current &&
    revealed?.id === current.id &&
    revealed.version === access.privacyVersion,
  );

  const closeTransientState = useCallback(() => {
    setNotice(null);
    setRevealed(null);
    setDraft(null);
    setPendingImage(null);
    setPassword("");
    setPasswordVisible(false);
    setBackupAsset(null);
    setMenuOpen(false);
    setBackupMenuOpen(false);
    confirmationRef.current?.resolve(false);
    setConfirmation(null);
    setScreen("home");
  }, []);

  useEffect(() => {
    if (access.locked) closeTransientState();
  }, [access.locked, closeTransientState]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (confirmationRef.current) {
          confirmationRef.current.resolve(false);
          setConfirmation(null);
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
          closeTransientState();
          return true;
        }
        return false;
      },
    );
    return () => subscription.remove();
  }, [screen, menuOpen, backupMenuOpen, pendingImage, closeTransientState]);

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
    setDraft({
      id: randomUUID(),
      name: "",
      number: "",
      cvv: "",
      expiry: "",
      note: "",
      tone: CARD_TONES[cards.length % CARD_TONES.length],
      type: "debit",
    });
    setScreen("editor");
  }

  async function editCurrent() {
    if (!current || !(await authenticate("验证身份后编辑卡片"))) return;
    setRevealed(null);
    setDraft({ ...current });
    setScreen("editor");
  }

  async function saveDraft() {
    if (!draft) return;
    ensureAccessible();
    const validation = validateCardDraft(draft);
    if (validation) throw new Error(validation);
    const saved: Card = {
      ...draft,
      name: draft.name.trim(),
      number: draft.number.replace(/\s/g, ""),
    };
    const originalImage = saved.image;
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
    setSelectedId(saved.id);
    setDraft(null);
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
    const targetRatio = 1.586;
    const crop = {
      originX: 0,
      originY: 0,
      width: image.width,
      height: image.height,
    };
    if (image.width / image.height > targetRatio) {
      crop.width = Math.round(image.height * targetRatio);
      crop.originX = Math.round((image.width - crop.width) / 2);
    } else {
      crop.height = Math.round(image.width / targetRatio);
      crop.originY = Math.round((image.height - crop.height) / 2);
    }
    const actions: ImageManipulator.Action[] = [{ crop }];
    if (crop.width > 1200) actions.push({ resize: { width: 1200 } });
    const resultImage = await ImageManipulator.manipulateAsync(
      image.uri,
      actions,
      {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: Platform.OS === "web",
      },
    );
    ensureAccessible();
    // If the app was locked during the picker, authentication succeeded but the old draft was cleared.
    setDraft((previous) => previous ?? draft);
    setScreen("editor");
    setPendingImage(
      Platform.OS === "web" && resultImage.base64
        ? `data:image/jpeg;base64,${resultImage.base64}`
        : resultImage.uri,
    );
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
    if (current.image && !next.some((card) => card.image === current.image))
      await discardOwnedImage(current.image);
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

  async function reorder(id: string, direction: -1 | 1) {
    ensureAccessible();
    await storage.update((previous) => moveCard(previous, id, direction));
  }

  function openPage(page: Screen) {
    setNotice(null);
    setMenuOpen(false);
    setBackupMenuOpen(false);
    setPassword("");
    setPasswordVisible(false);
    setBackupAsset(null);
    setRevealed(null);
    setScreen(page);
  }

  async function exportBackup() {
    if (!password.trim()) throw new Error("请输入备份密码。");
    if (!(await authenticate("验证身份后导出全部卡片"))) return;
    setBackupProgress("正在读取卡片和图片…");
    const backup = await buildBackupCards(await storage.read());
    // Give the progress indicator a frame before password derivation starts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    setBackupProgress("正在加密备份，请稍候…");
    const payload = await encryptBackup(
      JSON.stringify({ version: 3, cards: backup }),
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
    }
    setPassword("");
    setPasswordVisible(false);
    notify("备份已生成", `文件：${name}\n请妥善保管备份文件和密码。`);
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
    const parsed = backupSchema.parse(input);
    ensureAccessible();
    const description = storage.ready
      ? `将以备份中的 ${parsed.cards.length} 张卡片替换当前卡包。是否继续？`
      : `将恢复备份中的 ${parsed.cards.length} 张卡片。无法读取的原始数据会另存到本机，供后续排查。是否继续？`;
    setBackupProgress("");
    if (!(await askConfirmation("恢复备份", description))) return;
    ensureAccessible();
    setBackupProgress("正在恢复卡片和图片…");
    const restored = await restoreBackupCards(parsed);
    try {
      ensureAccessible();
      if (storage.ready) await storage.update(() => restored.cards);
      else await storage.recover(restored.cards);
    } catch (error) {
      await restored.discard();
      throw error;
    }
    if (!accessRef.current.isAccessible()) return;
    setSelectedId(restored.cards[0]?.id ?? null);
    closeTransientState();
    notify("恢复完成", `已恢复 ${restored.cards.length} 张卡片。`);
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
    about: "关于 CardBox",
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
              onPress={closeTransientState}
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
          disabled={busy}
          onChange={(mode) => {
            setRevealed(null);
            browse.selectMode(mode);
          }}
        />
      )}
      {screen === "home" &&
        (current ? (
          browse.mode === "classic" ? (
            <ScrollView contentContainerStyle={styles.content}>
              <View {...swipe.panHandlers}>
                <CardFace card={current} />
              </View>
              {cardNavigation}
              {cardDetails}
            </ScrollView>
          ) : (
            <View style={styles.grow}>
              <CardBrowser
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
          <CardFace card={current} />
          {cardDetails}
        </ScrollView>
      )}

      {screen === "all" && (
        <ScrollView contentContainerStyle={styles.content}>
          {cards.length ? (
            <View style={styles.grid}>
              {cards.map((card) => (
                <Pressable
                  disabled={busy}
                  key={card.id}
                  style={styles.gridItem}
                  onPress={() => chooseCard(card.id)}
                >
                  <CardFace card={card} compact />
                  <Text style={styles.gridName}>{card.name}</Text>
                  <Text style={styles.muted}>{CARD_TYPES[card.type]}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>还没有卡片，点击右下角 + 添加。</Text>
          )}
        </ScrollView>
      )}

      {screen === "sort" && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.muted}>
            点击上下箭头调整卡片顺序，顺序自动保存在本机。
          </Text>
          {cards.map((card, index) => (
            <View key={card.id} style={styles.sortRow}>
              <Text style={styles.position}>{index + 1}</Text>
              <View style={styles.thumbnail}>
                <CardFace card={card} compact />
              </View>
              <View style={styles.grow}>
                <Text style={styles.gridName}>{card.name}</Text>
                <Text style={styles.muted}>{CARD_TYPES[card.type]}</Text>
              </View>
              <Pressable
                disabled={busy || index === 0}
                style={[
                  styles.iconButton,
                  (busy || index === 0) && styles.disabled,
                ]}
                onPress={() => void run(() => reorder(card.id, -1))}
                accessibilityLabel={`上移${card.name}`}
              >
                {icon("arrow-up", 18)}
              </Pressable>
              <Pressable
                disabled={busy || index === cards.length - 1}
                style={[
                  styles.iconButton,
                  (busy || index === cards.length - 1) && styles.disabled,
                ]}
                onPress={() => void run(() => reorder(card.id, 1))}
                accessibilityLabel={`下移${card.name}`}
              >
                {icon("arrow-down", 18)}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {screen === "editor" && draft && (
        <CardEditor
          card={draft}
          onChange={setDraft}
          onPickImage={() => void run(chooseImage)}
          busy={busy}
        />
      )}

      {(screen === "export" || screen === "import") && (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.backupIntro}>
            {icon("document-lock-outline", 66)}
            <Text style={[styles.muted, styles.centerText]}>
              {screen === "export"
                ? "导出所有卡片数据（包含卡面图片）\n生成一个加密的 .cardbox 备份文件"
                : "选择 .cardbox 备份文件\n并输入备份密码进行恢复"}
            </Text>
          </View>
          {screen === "import" && (
            <Pressable
              disabled={busy}
              style={styles.surface}
              onPress={() => void run(chooseBackup)}
            >
              <View style={styles.row}>
                {icon("folder-outline")}
                <Text style={[styles.text, styles.grow]} numberOfLines={2}>
                  {backupAsset ? `已选择：${backupAsset.name}` : "选择备份文件"}
                </Text>
              </View>
            </Pressable>
          )}
          <View style={styles.password}>
            <TextInput
              accessibilityLabel="备份密码"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              secureTextEntry={!passwordVisible}
              placeholder={
                screen === "export" ? "设置备份密码" : "输入备份密码"
              }
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.passwordInput]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              disabled={busy}
              style={[styles.iconButton, styles.passwordButton]}
              onPress={() => setPasswordVisible(!passwordVisible)}
              accessibilityLabel={passwordVisible ? "隐藏密码" : "显示密码"}
            >
              {icon(passwordVisible ? "eye-off-outline" : "eye-outline", 19)}
            </Pressable>
          </View>
          <Pressable
            disabled={busy}
            style={[styles.primary, busy && styles.disabled]}
            onPress={() =>
              void run(screen === "export" ? exportBackup : importBackup)
            }
          >
            <Text style={styles.primaryText}>
              {working
                ? backupProgress || "正在处理…"
                : screen === "export"
                  ? Platform.OS === "android"
                    ? "选择保存位置"
                    : "生成加密备份"
                  : "开始导入"}
            </Text>
          </Pressable>
          <Text style={styles.muted}>
            {screen === "export"
              ? "请妥善保管备份文件和密码，密码丢失后无法恢复。"
              : "导入会替换当前卡包，确认前请先备份现有卡片。"}
          </Text>
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
                  ["about", "information-circle-outline", "关于"],
                ] as const)
            ).map(([page, name, label]) => (
              <Pressable
                key={page}
                accessibilityLabel={label}
                disabled={busy}
                style={styles.menuItem}
                onPress={() => {
                  if (page === "add") void run(async () => startNew());
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
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>确认使用卡面</Text>
            <Image
              source={{ uri: pendingImage }}
              style={{ width: "100%", aspectRatio: 1.586, borderRadius: 12 }}
              resizeMode="cover"
            />
            <Pressable
              style={styles.primary}
              onPress={() => {
                setDraft((previous) =>
                  previous ? { ...previous, image: pendingImage } : previous,
                );
                setPendingImage(null);
              }}
            >
              <Text style={styles.primaryText}>确认使用</Text>
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                setPendingImage(null);
                void run(chooseImage);
              }}
            >
              <Text style={styles.outlineText}>重新选择</Text>
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => setPendingImage(null)}
            >
              <Text style={styles.muted}>取消</Text>
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
