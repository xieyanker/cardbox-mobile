import { z } from "zod";
export const PREFERENCES_KEY = "cardbox.preferences.v1";
export const preferenceSchema = z.object({
  favorites: z.array(z.string().max(128)).max(1000).default([]),
  lastSelectedId: z.string().max(128).nullable().default(null),
  privateImages: z.boolean().default(false),
});
export type Preferences = z.infer<typeof preferenceSchema>;
export const defaultPreferences = (): Preferences => preferenceSchema.parse({});

export function reconcilePreferences(
  value: Preferences,
  cards: { id: string }[],
) {
  const ids = new Set(cards.map((card) => card.id));
  return {
    ...value,
    favorites: [...new Set(value.favorites)].filter((id) => ids.has(id)),
    lastSelectedId:
      value.lastSelectedId && ids.has(value.lastSelectedId)
        ? value.lastSelectedId
        : null,
  };
}

/** Restoring data must never turn off an already enabled privacy setting. */
export function restorePreferences(
  current: Preferences,
  saved: Preferences | undefined,
  cards: { id: string }[],
) {
  return reconcilePreferences(
    {
      ...(saved ?? current),
      privateImages: current.privateImages || Boolean(saved?.privateImages),
    },
    cards,
  );
}

/** Serialize changes; only acknowledge settings once durable storage has succeeded. */
export function createPreferenceRepository(storage: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}) {
  let state = defaultPreferences();
  let loaded: Promise<Preferences> | undefined;
  let queue = Promise.resolve();
  function load() {
    return (loaded ??= storage
      .getItem(PREFERENCES_KEY)
      .then((raw) => {
        if (raw !== null) state = preferenceSchema.parse(JSON.parse(raw));
        return state;
      })
      .catch((error) => {
        loaded = undefined;
        throw error;
      })).then(() => state);
  }
  function update(change: (value: Preferences) => Preferences) {
    const operation = queue.then(async () => {
      await load();
      const next = preferenceSchema.parse(
        change({ ...state, favorites: [...state.favorites] }),
      );
      await storage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      state = next;
      return next;
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  return { load, update };
}
