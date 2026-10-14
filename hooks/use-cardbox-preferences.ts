import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPreferenceRepository,
  defaultPreferences,
  reconcilePreferences,
  type Preferences,
} from "../lib/cardbox-preferences";
import type { useCardboxCards } from "./use-cardbox-cards";

export function useCardboxPreferences(
  storage: ReturnType<typeof useCardboxCards>,
) {
  const storageRef = useRef(storage);
  storageRef.current = storage;
  const [repository] = useState(() => createPreferenceRepository(AsyncStorage));
  const [value, setValue] = useState(defaultPreferences);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void repository
      .load()
      .then((next) => {
        if (mounted.current) {
          setValue(next);
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted.current)
          setError("常用卡与隐私设置读取失败，原设置已保留，请重启后重试。");
      });
    return () => {
      mounted.current = false;
    };
  }, [repository]);
  const update = useCallback(
    async (change: (value: Preferences) => Preferences) => {
      const currentStorage = storageRef.current;
      const cards = currentStorage.ready ? await currentStorage.read() : null;
      const next = await repository.update((value) => {
        const changed = change(
          cards ? reconcilePreferences(value, cards) : value,
        );
        return cards ? reconcilePreferences(changed, cards) : changed;
      });
      if (mounted.current) {
        setValue(next);
        setError("");
        setReady(true);
      }
    },
    [repository],
  );
  return { ...value, ready, error, update };
}
