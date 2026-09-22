/** Which flow a round is being logged from; each has its own membership rule. */
export enum AddRoundMode {
  Log = "log",
  Top = "top",
  Friend = "friend",
}

/** Whole, non-negative quantity with a floor; NaN and Infinity become the minimum. */
export function normalizeQuantity(value: number, minimum = 0): number {
  return Math.max(minimum, Math.floor(Number.isFinite(value) ? value : minimum));
}
