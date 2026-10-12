import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BROWSE_MODE_KEY,
  BROWSE_ORDER_KEY,
  DEFAULT_BROWSE_ORDER,
  parseBrowseMode,
  parseBrowseOrder,
  type BrowseMode,
} from "../shared/cardbox-browse";

export function useCardboxBrowse() {
  const [mode, setMode] = useState<BrowseMode>("classic");
  const [order, setOrder] = useState<BrowseMode[]>([...DEFAULT_BROWSE_ORDER]);
  const changed = useRef(false);
  const orderChanged = useRef(false);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(BROWSE_MODE_KEY)
      .then((value) => {
        if (mounted && !changed.current) setMode(parseBrowseMode(value));
      })
      .catch(() => undefined);
    void AsyncStorage.getItem(BROWSE_ORDER_KEY)
      .then((value) => {
        if (mounted && !orderChanged.current) setOrder(parseBrowseOrder(value));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  const selectMode = useCallback((next: BrowseMode) => {
    changed.current = true;
    const operation = writes.current.then(async () => {
      await AsyncStorage.setItem(BROWSE_MODE_KEY, next);
      setMode(next);
    });
    writes.current = operation.catch(() => undefined);
    return operation;
  }, []);
  const saveOrder = useCallback((next: BrowseMode[]) => {
    orderChanged.current = true;
    const valid = parseBrowseOrder(JSON.stringify(next));
    const operation = writes.current.then(async () => {
      await AsyncStorage.setItem(BROWSE_ORDER_KEY, JSON.stringify(valid));
      setOrder(valid);
    });
    writes.current = operation.catch(() => undefined);
    return operation;
  }, []);
  return { mode, order, selectMode, saveOrder };
}
