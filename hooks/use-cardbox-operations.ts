import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { z } from "zod";
import type { useCardboxAccess } from "./use-cardbox-access";

type Confirmation = {
  title: string;
  description: string;
  resolve: (value: boolean) => void;
};

/** Shared operation gate: authentication, confirmations and truthful failure feedback. */
export function useCardboxOperations(
  access: ReturnType<typeof useCardboxAccess>,
  storageBusy: boolean,
) {
  const accessRef = useRef(access);
  accessRef.current = access;
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const [notice, setNotice] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationRef = useRef<Confirmation | null>(null);
  const notify = useCallback((title: string, description: string) => {
    if (Platform.OS === "web") setNotice({ title, description });
    else Alert.alert(title, description);
  }, []);
  const resolveConfirmation = useCallback((value: boolean) => {
    const current = confirmationRef.current;
    confirmationRef.current = null;
    setConfirmation(null);
    current?.resolve(value);
  }, []);
  const askConfirmation = useCallback((title: string, description: string) => {
    return new Promise<boolean>((resolve) => {
      confirmationRef.current?.resolve(false);
      const next = { title, description, resolve };
      confirmationRef.current = next;
      setConfirmation(next);
    });
  }, []);
  useEffect(() => {
    if (access.locked) resolveConfirmation(false);
  }, [access.locked, resolveConfirmation]);
  useEffect(
    () => () => {
      confirmationRef.current?.resolve(false);
    },
    [],
  );
  const isAccessible = useCallback(() => accessRef.current.isAccessible(), []);
  const ensureAccessible = useCallback(() => {
    if (!accessRef.current.isAccessible())
      throw new Error("应用已锁定，请解锁后重新操作。");
  }, []);
  const authenticate = useCallback(async (reason: string) => {
    const success = await accessRef.current.authenticate(reason);
    return success && accessRef.current.isAccessible();
  }, []);
  const privacyVersion = useCallback(
    () => accessRef.current.snapshot().privacyVersion,
    [],
  );
  const resumeAfterPicker = useCallback(async () => {
    if (!(await accessRef.current.waitForForeground()))
      throw new Error("应用尚未恢复到前台，请解锁后重试。");
    if (
      accessRef.current.snapshot().locked &&
      !(await accessRef.current.unlock())
    )
      return false;
    return accessRef.current.isAccessible();
  }, []);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (workingRef.current) return;
      workingRef.current = true;
      setWorking(true);
      setNotice(null);
      try {
        await action();
      } catch (error) {
        notify(
          "操作未完成",
          error instanceof z.ZodError
            ? "卡片或备份格式无效，原数据未修改。"
            : error instanceof Error
              ? error.message
              : "操作失败，请重试。",
        );
      } finally {
        workingRef.current = false;
        setWorking(false);
      }
    },
    [notify],
  );
  return {
    working,
    workingRef,
    busy: working || storageBusy || access.authenticating,
    notice,
    setNotice,
    notify,
    confirmation,
    confirmationRef,
    askConfirmation,
    resolveConfirmation,
    run,
    isAccessible,
    ensureAccessible,
    authenticate,
    privacyVersion,
    resumeAfterPicker,
  };
}
export type CardboxOperations = ReturnType<typeof useCardboxOperations>;
