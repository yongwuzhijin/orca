export const MIN_SPLIT_RATIO = 0.2
export const MAX_SPLIT_RATIO = 0.8
export const DEFAULT_SPLIT_RATIO = 0.5

/** Keeps either pane from being dragged narrower than a fifth of the surface. */
export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_SPLIT_RATIO
  }
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio))
}
