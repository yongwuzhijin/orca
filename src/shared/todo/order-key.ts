// Base-36 with strictly ascending ASCII so plain string `<` sorts keys correctly.
const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length
const MID_DIGIT = DIGITS[Math.floor(BASE / 2)]

export const FIRST_ORDER_KEY = MID_DIGIT

function digitAt(key: string, index: number): number {
  return index < key.length ? DIGITS.indexOf(key[index]) : 0
}

// Returns a key c with a < c < b (lexicographically), where `a` is the lower
// bound ('' = smallest) and `b` is the upper bound (null = largest). Shares a
// common prefix by extending length rather than failing when no digit fits.
function midpoint(a: string, b: string | null): string {
  // Accumulate the shared prefix from the real shared digit rather than slicing
  // `a`: when `a` is the empty/short lower bound, digitAt pads with '0', so
  // a.slice(0, i) would drop leading zeros that `b` actually carries and yield a
  // key greater than `b`. da === db here, so DIGITS[da] is the true shared digit.
  let prefix = ''
  let i = 0
  while (true) {
    const da = digitAt(a, i)
    const db = b !== null && i < b.length ? DIGITS.indexOf(b[i]) : BASE
    if (da === db) {
      prefix += DIGITS[da]
      i++
      continue
    }
    const mid = Math.floor((da + db) / 2)
    if (mid !== da) {
      return prefix + DIGITS[mid]
    }
    // No room between adjacent digits: keep a's digit and recurse into its tail
    // with an open upper bound, guaranteeing a strictly larger extension.
    return prefix + DIGITS[da] + midpoint(a.slice(i + 1), null)
  }
}

export function orderKeyBetween(before: string | null, after: string | null): string {
  if (before === null && after === null) {
    return FIRST_ORDER_KEY
  }
  if (before !== null && after !== null && before >= after) {
    throw new Error(`orderKeyBetween: before (${before}) must be < after (${after})`)
  }
  return midpoint(before ?? '', after)
}
