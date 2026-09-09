# AI Translation via OpenAI-Compatible API

Date: 2026-09-01  
Status: approved design (pending user review of this file)

## Summary

Replace status-bar AI translation’s agent-CLI path with an OpenAI-compatible `chat/completions` HTTP call. Users configure `baseUrl`, encrypted `apiKey`, and `model` in Appearance (next to the translate dictionary setting). Switching to AI without an API key shows an inline reminder with a deep link to settings.

## Goals

- AI translate uses HTTP only (no agent CLI / `runLocalPlanForAgent`).
- Settings: Base URL, API Key, Model (Appearance → beside translate dictionary).
- Defaults: `baseUrl = https://dashscope.aliyuncs.com/compatible-mode/v1`, `model = qwen-mt-flash`.
- Unconfigured API key → inline prompt + “Go to settings”; do not call the API.
- Keep a dedicated translation cancel lane (`AbortController`), isolated from commit-message generation.
- Keep existing `buildTranslationPrompt` behavior (word senses vs sentence translation).

## Non-goals

- No dual mode with agent CLI fallback.
- Do not persist API key in `GlobalSettings` / synced settings JSON.
- Do not add the `openai` npm package; use `fetch`.
- Do not change the free (non-AI) translation providers.

## Architecture

```
Translate popover (AI on)
  → configured? (encrypted apiKey present)
      no  → inline reminder + openSettingsTarget(Appearance AI translate)
      yes → IPC translation:translateWithAi
            → translateTextWithAi
            → openai-compatible client (fetch + AbortController)
            → TranslationResponse (providerId: 'ai')
```

### Main process

| Piece | Role |
|-------|------|
| `openai-compatible-translation-client.ts` | Build URL, Authorization, body; parse `choices[0].message.content`; map HTTP errors; honor abort/timeout |
| `ai-translation.ts` (rewrite) | Resolve settings defaults, read encrypted key, call client, map to `TranslationResponse`; cancel via abort |
| `translate-ai-api-key-store.ts` | Encrypt/decrypt/clear key file under Orca home (mirror speech OpenAI key store) |
| IPC | Existing `translateWithAi` / `cancelAi`; plus has/save/clear key channels |

### Renderer

| Piece | Role |
|-------|------|
| Appearance AI translate setting | Base URL + Model inputs; API key save/clear (password dialog pattern like Voice OpenAI key) |
| Translate popover | On AI toggle / submit without key → inline copy + “Go to settings”; update AI hint strings |
| Result panel | Reuse `providerId: 'ai'`; put **model name** in `agentLabel` (avoid broad rename) |

## Settings & storage

**GlobalSettings (new optional fields):**

- `translateAiBaseUrl?: string` — empty/missing → default DashScope compatible-mode URL
- `translateAiModel?: string` — empty/missing → `qwen-mt-flash`

**Secret store:**

- File e.g. `translate-ai-api-key.enc` in Orca home
- APIs: `hasTranslateAiApiKey`, `saveTranslateAiApiKey`, `clearTranslateAiApiKey`
- Never return the raw key to the renderer after save; renderer only sees configured boolean

**Configured gate:** encrypted API key exists and is non-empty. Default baseUrl/model alone do not block AI mode.

**Deep link:** “Go to settings” → Appearance pane, scroll/highlight the AI translate search entry (same pattern as other Appearance deep links).

## Request contract

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Content-Type: application/json

{
  "model": "{translateAiModel or default}",
  "messages": [{ "role": "user", "content": "<buildTranslationPrompt>" }]
}
```

- Normalize `baseUrl` trailing slash before joining `/chat/completions`.
- Timeout: ~60s.
- Input limits: unchanged (empty → `invalid-input`; >5000 → `too-long`).
- Cancel: abort in-flight fetch on `translation:cancelAi`.

## Error mapping

| Condition | Response |
|-----------|----------|
| No API key (renderer) | Inline reminder; no IPC call preferred |
| No API key (main) | `ai-unavailable` + setup detail |
| 401 / invalid key | `ai-unavailable`, prompt to check API key |
| Network failure | `offline` when distinguishable |
| Timeout / abort | `timeout` / silent cancel (no success) |
| Empty content / other non-OK | `ai-unavailable` + redacted detail (never echo key) |

Keep “Use the quick translation” fallback on `ai-unavailable`.

## UI copy (intent)

- AI toggle hint: configured OpenAI-compatible API (not “AI agent”).
- Inline missing-key: ask user to configure AI translation API key; link to settings.
- Settings: titles/descriptions for Base URL, API Key, Model; searchable keywords (translate, AI, API, DashScope, etc.).
- All user-visible strings via `translate()` + all locales.

## Testing

- Client: happy path, 401, timeout, abort, empty content, baseUrl slash joining.
- `translateTextWithAi`: missing key, defaults applied, cancel.
- Key store + IPC CRUD.
- Popover: AI without key → inline + deep link; with key → submit; free path unchanged.
- Settings row: save/clear key; update baseUrl/model.
- Localization verify/sync when catalog applies.

## Out of scope follow-ups

- Model picker / live model list from provider.
- Streaming responses.
- Per-repo overrides.

## Prior verification note

A one-off curl against DashScope with a user-supplied key returned `401 invalid_api_key`. Implementation must treat auth failure as a first-class UX path; do not ship any hardcoded API key.
