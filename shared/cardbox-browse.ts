export const BROWSE_MODE_KEY = "cardbox.browse.mode.v1";
export const BROWSE_ORDER_KEY = "cardbox.browse.order.v1";
export const BROWSE_MODES = {
  classic: "经典",
  wallet: "钱包",
  stack: "堆叠",
  focus: "聚焦",
} as const;
export type BrowseMode = keyof typeof BROWSE_MODES;
export type AnimatedBrowseMode = Exclude<BrowseMode, "classic">;
export const DEFAULT_BROWSE_ORDER: readonly BrowseMode[] = [
  "classic",
  "wallet",
  "stack",
  "focus",
];
export function parseBrowseOrder(value: string | null): BrowseMode[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (
      Array.isArray(parsed) &&
      parsed.length === DEFAULT_BROWSE_ORDER.length &&
      new Set(parsed).size === parsed.length &&
      parsed.every((mode) => DEFAULT_BROWSE_ORDER.includes(mode))
    ) {
      return parsed as BrowseMode[];
    }
  } catch {
    /* Restore the default when a stored preference is damaged. */
  }
  return [...DEFAULT_BROWSE_ORDER];
}
export function parseBrowseMode(value: string | null): BrowseMode {
  return value && Object.prototype.hasOwnProperty.call(BROWSE_MODES, value)
    ? (value as BrowseMode)
    : "classic";
}
