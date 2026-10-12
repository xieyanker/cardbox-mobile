import { z } from "zod";
export const PREFERENCES_KEY = "cardbox.preferences.v1";
export const preferenceSchema = z.object({
  favorites: z.array(z.string().max(128)).max(1000).default([]),
  lastSelectedId: z.string().max(128).nullable().default(null),
  privateImages: z.boolean().default(false),
});
export type Preferences = z.infer<typeof preferenceSchema>;
export const defaultPreferences = (): Preferences => preferenceSchema.parse({});

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
