import {
  CARD_STORAGE_KEY,
  cardListSchema,
  parseCards,
  type Card,
} from "../shared/cardbox";

type RepositoryDependencies = {
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };
  encrypt: (value: string) => Promise<string>;
  decrypt: (value: string) => Promise<string>;
};

/** Only successfully decoded data may be edited; writes complete in request order. */
export function createCardRepository({
  storage,
  encrypt,
  decrypt,
}: RepositoryDependencies) {
  let cards: Card[] = [];
  let loaded = false;
  let loading: Promise<Card[]> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const copy = () => cards.map((card) => ({ ...card }));

  async function load(): Promise<Card[]> {
    if (loaded) return copy();
    if (loading) return loading;
    loading = (async () => {
      const raw = await storage.getItem(CARD_STORAGE_KEY);
      const decoded =
        raw === null
          ? []
          : parseCards(
              raw.trimStart().startsWith("[") ? raw : await decrypt(raw),
            );
      cards = decoded;
      loaded = true;
      return copy();
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  function update(change: (current: Card[]) => Card[]): Promise<Card[]> {
    const operation = queue.then(async () => {
      await load();
      const next = cardListSchema.parse(change(copy()));
      const encrypted = await encrypt(JSON.stringify(next));
      await storage.setItem(CARD_STORAGE_KEY, encrypted);
      cards = next;
      return copy();
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  // Explicit recovery is allowed only after the user confirms a validated backup.
  function recover(next: Card[]): Promise<Card[]> {
    const operation = queue.then(async () => {
      const validated = cardListSchema.parse(next);
      const original = await storage.getItem(CARD_STORAGE_KEY);
      if (original !== null) {
        await storage.setItem(
          `${CARD_STORAGE_KEY}.recovery.${Date.now()}`,
          original,
        );
      }
      const encrypted = await encrypt(JSON.stringify(validated));
      await storage.setItem(CARD_STORAGE_KEY, encrypted);
      cards = validated;
      loaded = true;
      return copy();
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  return {
    load,
    update,
    recover,
    replace: (next: Card[]) => update(() => next),
    read: async () => {
      await queue;
      return load();
    },
  };
}
