import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPreferenceRepository,
  defaultPreferences,
  type Preferences,
} from "../lib/cardbox-preferences";

export function useCardboxPreferences() {
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
      const next = await repository.update(change);
      if (mounted.current) {
        setValue(next);
        setError("");
      }
    },
    [repository],
  );
  return { ...value, ready, error, update };
}
