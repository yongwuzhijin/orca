# Session Composer Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ddd-subagent-driven-development (recommended) or ddd-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate session control bar with Cursor-style send/stop and permission-mode controls inside the conversation composer.

**Architecture:** Keep existing callbacks and ACP mode values (`auto` / `ask`). Refactor only `SessionConversation`: idle uses a circular send action, running uses the same action position as stop, and a radio dropdown below the input controls permission mode.

**Tech Stack:** React, shadcn-style Radix dropdown, lucide-react, Vitest, Testing Library, project i18n.

## Global Constraints

- Follow `docs/STYLEGUIDE.md`; use existing tokens and primitives.
- Localize every visible and accessible label in all locale catalogs.
- Preserve permission cards and follow-up behavior.

---

### Task 1: Composer controls

**Files:**
- Modify: `src/renderer/src/components/todo/detail/SessionConversation.tsx`
- Test: `src/renderer/src/components/todo/detail/SessionConversation.test.tsx`
- Modify: `src/renderer/src/i18n/locales/{en,zh,ja,ko,es}.json`

- [x] Update tests for idle send, running stop, removed Cancel/checkbox, and mode dropdown.
- [x] Run focused tests and confirm RED.
- [x] Implement rounded composer, send/stop action, and permission mode radio dropdown.
- [x] Add all locale translations.
- [x] Run tests, lints, and localization verification.
