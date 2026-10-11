export const BROWSE_MODE_KEY = "cardbox.browse.mode.v1";
export const BROWSE_MODES = {
  classic: "经典",
  stack: "堆叠",
  focus: "聚焦",
  wallet: "钱包",
} as const;
export type BrowseMode = keyof typeof BROWSE_MODES;
export type AnimatedBrowseMode = Exclude<BrowseMode, "classic">;
export function parseBrowseMode(value: string | null): BrowseMode {
  return value && Object.prototype.hasOwnProperty.call(BROWSE_MODES, value)
    ? (value as BrowseMode)
    : "classic";
}
