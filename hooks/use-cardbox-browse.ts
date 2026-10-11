import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BROWSE_MODE_KEY,
  parseBrowseMode,
  type BrowseMode,
} from "../shared/cardbox-browse";

export function useCardboxBrowse() {
  const [mode, setMode] = useState<BrowseMode>("classic");
  const changed = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(BROWSE_MODE_KEY)
      .then((value) => {
        if (mounted && !changed.current) setMode(parseBrowseMode(value));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  const selectMode = useCallback((next: BrowseMode) => {
    changed.current = true;
    setMode(next);
    writes.current = writes.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(BROWSE_MODE_KEY, next))
      .catch(() => undefined);
  }, []);
  return { mode, selectMode };
}
