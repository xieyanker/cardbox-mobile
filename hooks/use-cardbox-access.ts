import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, Platform } from "react-native";
import { createAccessController } from "../lib/cardbox-access";
import {
  DEFAULT_LOCK_TIMEOUT,
  LOCK_TIMEOUT_KEY,
  parseLockTimeout,
} from "../shared/cardbox";

async function verifyDevice(reason: string) {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE)
    throw new Error("请先在系统设置中设置锁屏密码、指纹或面容识别。");
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    disableDeviceFallback: false,
    biometricsSecurityLevel: "strong",
    fallbackLabel: "使用锁屏密码",
    cancelLabel: "取消",
  });
  return result.success;
}

export function useCardboxAccess() {
  const controller = useRef(
    createAccessController({
      native: Platform.OS !== "web",
      verify: verifyDevice,
      systemCredentialActivity:
        Platform.OS === "android" && Number(Platform.Version) < 30,
    }),
  ).current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [timeout, setTimeoutState] = useState(DEFAULT_LOCK_TIMEOUT);
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LOCK_TIMEOUT_KEY)
      .then((value) => {
        if (!active) return;
        const next = parseLockTimeout(value);
        controller.setTimeout(next);
        setTimeoutState(next);
      })
      .catch(() => {
        /* Default remains safe if preferences cannot be read. */
      })
      .finally(() => {
        if (active) setSettingsReady(true);
      });
    controller.onAppState(AppState.currentState);
    const subscription = AppState.addEventListener(
      "change",
      controller.onAppState,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, [controller]);

  const setTimeout = useCallback(
    async (next: number) => {
      if (!settingsReady) throw new Error("锁定设置尚未读取完成，请稍后再试。");
      await AsyncStorage.setItem(LOCK_TIMEOUT_KEY, String(next));
      controller.setTimeout(next);
      setTimeoutState(next);
    },
    [controller, settingsReady],
  );

  return {
    ...state,
    timeout,
    settingsReady,
    setTimeout,
    authenticate: controller.authenticate,
    unlock: controller.unlock,
    snapshot: controller.snapshot,
    waitForForeground: controller.waitForForeground,
    isAccessible: () => {
      const current = controller.snapshot();
      return !current.locked && !current.obscured;
    },
  };
}
