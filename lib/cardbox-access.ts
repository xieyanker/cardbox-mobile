import {
  DEFAULT_LOCK_TIMEOUT,
  shouldLockAfterBackground,
} from "../shared/cardbox";

type AccessState = {
  locked: boolean;
  obscured: boolean;
  authenticating: boolean;
  privacyVersion: number;
};
type AccessDependencies = {
  native: boolean;
  verify: (reason: string) => Promise<boolean>;
  now?: () => number;
  systemCredentialActivity?: boolean;
};

export function createAccessController({
  native,
  verify,
  now = Date.now,
  systemCredentialActivity = false,
}: AccessDependencies) {
  let state: AccessState = {
    locked: native,
    obscured: false,
    authenticating: false,
    privacyVersion: 0,
  };
  let timeout = DEFAULT_LOCK_TIMEOUT;
  let backgroundAt: number | null = null;
  let appState = "active";
  let epoch = 0;
  let authentication: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();

  function publish(change: Partial<AccessState>) {
    state = { ...state, ...change };
    listeners.forEach((listener) => listener());
  }

  function waitForForeground() {
    if (appState === "active") return Promise.resolve();
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        listeners.delete(onChange);
        resolve();
      };
      const onChange = () => {
        if (appState === "active") finish();
      };
      const timer = setTimeout(finish, 1500);
      listeners.add(onChange);
    });
  }

  async function authenticate(reason: string): Promise<boolean> {
    if (!native) return true;
    if (appState !== "active") return false;
    if (authentication) return authentication;
    const requestEpoch = epoch;
    publish({ authenticating: true });
    authentication = (async () => {
      try {
        const success = await verify(reason);
        // On Android 10 and older, PIN fallback is a separate system Activity.
        if (success && systemCredentialActivity && epoch === requestEpoch)
          await waitForForeground();
        return success && epoch === requestEpoch && appState === "active";
      } finally {
        authentication = null;
        publish({ authenticating: false });
      }
    })();
    return authentication;
  }

  function onAppState(next: string) {
    if (!native) return;
    // The operating system authentication dialog can make iOS temporarily inactive.
    if (next === "inactive" && state.authenticating) return;
    appState = next;
    if (next === "inactive" || next === "background") {
      if (backgroundAt === null) backgroundAt = now();
      if (!(state.authenticating && systemCredentialActivity)) epoch++;
      publish({ obscured: true, privacyVersion: state.privacyVersion + 1 });
    } else if (next === "active") {
      const mustLock =
        backgroundAt !== null &&
        shouldLockAfterBackground(timeout, now() - backgroundAt);
      backgroundAt = null;
      publish({ obscured: false, locked: state.locked || mustLock });
    }
  }

  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTimeout: (next: number) => {
      timeout = next;
    },
    onAppState,
    authenticate,
    unlock: async () => {
      if (await authenticate("解锁 CardBox")) {
        publish({ locked: false });
        return true;
      }
      return false;
    },
    lock: () => {
      epoch++;
      publish({ locked: true, privacyVersion: state.privacyVersion + 1 });
    },
  };
}
