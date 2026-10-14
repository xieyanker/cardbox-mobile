import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { CARD_TONES, validateCardDraft, type Card } from "../shared/cardbox";
import type { CropSource } from "../shared/cardbox-crop";
import { persistCardImage } from "../lib/cardbox-files";
import {
  discardOwnedImage,
  cleanupPreviousImages as cleanupCardImages,
} from "../lib/cardbox-image-maintenance";
import type { useCardboxCards } from "./use-cardbox-cards";
import type { useCardboxAccess } from "./use-cardbox-access";
import type { CardboxOperations } from "./use-cardbox-operations";
import type { CardboxNavigation } from "./use-cardbox-navigation";
import type { useCardboxPreferences } from "./use-cardbox-preferences";

export function useCardboxEditor({
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
  const {
    setMenuOpen,
    setBackupMenuOpen,
    setRevealed,
    setScreen,
    setSelectedId,
    selectedIndex,
    current,
  } = navigation;
  const cards = storage.cards;
  const [draft, setDraft] = useState<Card | null>(null);
  const initialDraft = useRef<Card | null>(null);
  const [leaveEditor, setLeaveEditor] = useState(false);
  const [pendingImage, setPendingImage] = useState<CropSource | null>(null);
  const suspendedDraft = useRef<{
    draft: Card;
    pendingImage: CropSource | null;
  } | null>(null);
  const dirty = Boolean(
    draft && JSON.stringify(draft) !== JSON.stringify(initialDraft.current),
  );
  const clearDraft = useCallback(() => {
    setDraft(null);
    initialDraft.current = null;
    suspendedDraft.current = null;
    setLeaveEditor(false);
    setPendingImage(null);
  }, []);
  useEffect(() => {
    if (access.locked) {
      if (draft) suspendedDraft.current = { draft, pendingImage };
      setLeaveEditor(false);
    } else if (suspendedDraft.current) {
      setDraft(suspendedDraft.current.draft);
      setPendingImage(suspendedDraft.current.pendingImage);
      setScreen("editor");
      suspendedDraft.current = null;
    }
  }, [access.locked, draft, pendingImage, setScreen]);
  const cleanupPreviousImages = (previous: Card[], next: Card[]) =>
    cleanupCardImages(storage, previous, next, notify);
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
    if (!isAccessible()) return;
    await cleanupPreviousImages(previous, await storage.read());
    setSelectedId(saved.id);
    setDraft(null);
    suspendedDraft.current = null;
    setScreen("home");
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
    await preferences
      .update((value) => value)
      .catch(() => {
        notify("卡片已删除", "常用卡设置清理失败，下次保存设置时会重试。");
      });
    await cleanupPreviousImages([current], next);
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? null);
    setRevealed(null);
  }

  return {
    draft,
    setDraft,
    dirty,
    leaveEditor,
    setLeaveEditor,
    pendingImage,
    setPendingImage,
    clearDraft,
    startNew,
    editCurrent,
    saveDraft,
    chooseImage,
    deleteCurrent,
  };
}
export type CardboxEditor = ReturnType<typeof useCardboxEditor>;
