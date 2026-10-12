import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { createCardRepository } from "../lib/cardbox-repository";
import { decryptLocal, encryptLocal } from "../lib/cardbox-security";
import type { Card } from "../shared/cardbox";

export function useCardboxCards() {
  const repository = useRef(
    createCardRepository({
      storage: AsyncStorage,
      encrypt: encryptLocal,
      decrypt: decryptLocal,
    }),
  ).current;
  const [cards, setCards] = useState<Card[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const next = await repository.load();
      if (mounted.current) {
        setCards(next);
        setReady(true);
      }
    } catch {
      if (mounted.current)
        setError("无法读取卡片数据。原数据已保留，请重试或检查设备密钥。");
    }
  }, [repository]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  const update = useCallback(
    async (change: (current: Card[]) => Card[]) => {
      setPending((count) => count + 1);
      try {
        const next = await repository.update(change);
        if (mounted.current) setCards(next);
        return next;
      } finally {
        if (mounted.current) setPending((count) => count - 1);
      }
    },
    [repository],
  );

  const recover = useCallback(
    async (next: Card[]) => {
      setPending((count) => count + 1);
      try {
        const restored = await repository.recover(next);
        if (mounted.current) {
          setCards(restored);
          setReady(true);
          setError(null);
        }
      } finally {
        if (mounted.current) setPending((count) => count - 1);
      }
    },
    [repository],
  );

  return {
    cards,
    ready,
    error,
    busy: pending > 0,
    reload,
    update,
    recover,
    read: repository.read,
    createRestorePoint: repository.createRestorePoint,
    readRestorePoint: repository.readRestorePoint,
  };
}
