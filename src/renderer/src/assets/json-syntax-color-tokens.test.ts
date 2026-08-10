import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainCss = fs.readFileSync(new URL('./main.css', import.meta.url), 'utf8')

const JSON_TOKEN_ROLES = ['key', 'string', 'number', 'boolean', 'null', 'punctuation'] as const

function getCssRuleBody(selector: string): string {
  const ruleMarker = mainCss.indexOf(`\n${selector} {`)
  expect(ruleMarker).toBeGreaterThanOrEqual(0)

  const ruleStart = ruleMarker + 1
  const bodyStart = mainCss.indexOf('{', ruleStart) + 1
  const bodyEnd = mainCss.indexOf('}', bodyStart)
  return mainCss.slice(bodyStart, bodyEnd)
}

function readDeclaration(body: string, property: string): string | null {
  return new RegExp(`${property}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? null
}

describe('json syntax color tokens', () => {
  it('declares every role in both themes with theme-specific values', () => {
    const light = getCssRuleBody(':root')
    const dark = getCssRuleBody('.dark')

    for (const role of JSON_TOKEN_ROLES) {
      const lightValue = readDeclaration(light, `--json-${role}`)
      const darkValue = readDeclaration(dark, `--json-${role}`)

      expect(lightValue, `--json-${role} missing from :root`).not.toBeNull()
      expect(darkValue, `--json-${role} missing from .dark`).not.toBeNull()
      // Why: an identical value means a light palette was copied into dark.
      expect(darkValue, `--json-${role} is not retuned for dark`).not.toBe(lightValue)
    }
  })

  it('exposes a Tailwind color alias for every role', () => {
    const theme = getCssRuleBody('@theme inline')

    for (const role of JSON_TOKEN_ROLES) {
      expect(readDeclaration(theme, `--color-json-${role}`)).toBe(`var(--json-${role})`)
    }
  })
})
