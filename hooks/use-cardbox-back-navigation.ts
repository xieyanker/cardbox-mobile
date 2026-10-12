import { useCallback, useEffect } from "react";
import { BackHandler } from "react-native";
import type { CardboxNavigation } from "./use-cardbox-navigation";
import type { CardboxEditor } from "./use-cardbox-editor";
import type { CardboxBackup } from "./use-cardbox-backup";
import type { CardboxOperations } from "./use-cardbox-operations";

/** Header and Android back use one policy, including modal priority and unsaved edits. */
export function useCardboxBackNavigation(
  navigation: CardboxNavigation,
  editor: CardboxEditor,
  backup: CardboxBackup,
  operations: CardboxOperations,
) {
  const {
    screen,
    menuOpen,
    backupMenuOpen,
    setMenuOpen,
    setBackupMenuOpen,
    openPage,
  } = navigation;
  const {
    dirty,
    leaveEditor,
    setLeaveEditor,
    pendingImage,
    setPendingImage,
    clearDraft,
  } = editor;
  const { clearTransient } = backup;
  const { workingRef, confirmationRef, resolveConfirmation, isAccessible } =
    operations;
  const closeTransientState = useCallback(() => {
    clearDraft();
    clearTransient();
    openPage("home");
  }, [clearDraft, clearTransient, openPage]);
  const requestBack = useCallback(() => {
    if (workingRef.current || !isAccessible()) return;
    if (screen === "editor" && dirty) setLeaveEditor(true);
    else closeTransientState();
  }, [
    workingRef,
    isAccessible,
    screen,
    dirty,
    setLeaveEditor,
    closeTransientState,
  ]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        // Back while locked must not discard the suspended editor session.
        if (!isAccessible()) return false;
        if (confirmationRef.current) {
          resolveConfirmation(false);
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
          if (backupMenuOpen) setBackupMenuOpen(false);
          else setMenuOpen(false);
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
    setMenuOpen,
    setBackupMenuOpen,
    pendingImage,
    setPendingImage,
    leaveEditor,
    setLeaveEditor,
    requestBack,
    confirmationRef,
    resolveConfirmation,
    isAccessible,
  ]);
  return { requestBack, closeTransientState };
}
