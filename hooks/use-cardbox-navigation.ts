import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder } from "react-native";
import * as Clipboard from "expo-clipboard";
import { moveCardTo } from "../shared/cardbox-tools";
import type { useCardboxCards } from "./use-cardbox-cards";
import type { useCardboxAccess } from "./use-cardbox-access";
import type { useCardboxPreferences } from "./use-cardbox-preferences";
import type { CardboxOperations } from "./use-cardbox-operations";

export type CardboxScreen =
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
const titles: Record<CardboxScreen, string> = {
  home: "CardBox",
  details: "卡片详情",
  all: "全部卡片",
  editor: "添加卡片",
  sort: "卡片排序",
  export: "导出备份",
  import: "导入备份",
  settings: "自动锁定",
  "browse-settings": "浏览模式",
  storage: "存储管理",
  about: "关于应用",
};
export function screenTitle(screen: CardboxScreen, editing: boolean) {
  return screen === "editor" && editing ? "编辑卡片" : titles[screen];
}
export function useCardboxNavigation({
  storage,
  access,
  preferences,
  operations,
}: {
  storage: ReturnType<typeof useCardboxCards>;
  access: ReturnType<typeof useCardboxAccess>;
  preferences: ReturnType<typeof useCardboxPreferences>;
  operations: CardboxOperations;
}) {
  const {
    busy,
    notify,
    setNotice,
    resolveConfirmation,
    authenticate,
    ensureAccessible,
    privacyVersion,
  } = operations;
  const { update: updatePreferences } = preferences;
  const cards = storage.cards;
  const [screen, setScreen] = useState<CardboxScreen>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectionReady, setSelectionReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const [revealed, setRevealed] = useState<{
    id: string;
    version: number;
  } | null>(null);
  const selectedIndex = Math.max(
    0,
    cards.findIndex((card) => card.id === selectedId),
  );
  const current = cards[selectedIndex];
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
  }, [selectionReady, current, updatePreferences, notify]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 30_000);
    return () => clearTimeout(timer);
  }, [revealed]);
  useEffect(() => {
    if (access.locked) {
      setRevealed(null);
      setMenuOpen(false);
      setBackupMenuOpen(false);
    }
  }, [access.locked]);
  const openPage = useCallback(
    (page: CardboxScreen) => {
      setNotice(null);
      setMenuOpen(false);
      setBackupMenuOpen(false);
      setRevealed(null);
      resolveConfirmation(false);
      setScreen(page);
    },
    [setNotice, resolveConfirmation],
  );
  function chooseCard(id: string) {
    if (busy) return;
    setSelectedId(id);
    openPage("home");
  }
  async function toggleSensitive() {
    if (!current) return;
    if (showSensitive) {
      setRevealed(null);
      return;
    }
    if (await authenticate("验证身份后显示卡片信息"))
      setRevealed({ id: current.id, version: privacyVersion() });
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
  async function reorderTo(id: string, target: number) {
    ensureAccessible();
    await storage.update((previous) => moveCardTo(previous, id, target));
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
  return {
    screen,
    setScreen,
    selectedId,
    setSelectedId,
    selectedIndex,
    current,
    menuOpen,
    setMenuOpen,
    backupMenuOpen,
    setBackupMenuOpen,
    setRevealed,
    showSensitive,
    openPage,
    chooseCard,
    toggleSensitive,
    copyField,
    reorderTo,
    swipe,
  };
}
export type CardboxNavigation = ReturnType<typeof useCardboxNavigation>;
