// Why: our rule dialect says '*' is the only metacharacter (see browser-network-rule.ts), but CDP's
// Fetch.enable urlPattern also reads '?' as a single-character wildcard and '\' as an escape. A
// literal '?' — any query string — would silently over-match, so escape what CDP adds. Every other
// character is literal in both dialects, which makes this lossless.
export function toCdpUrlPattern(rulePattern: string): string {
  let translated = ''
  for (const character of rulePattern) {
    if (character === '\\' || character === '?') {
      translated += `\\${character}`
      continue
    }
    translated += character
  }
  return translated
}
