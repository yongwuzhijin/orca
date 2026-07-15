# Session Restore Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ddd-subagent-driven-development (recommended) or ddd-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a localized loading state while Todo session metadata and conversation history are being restored.

**Architecture:** Keep loading lifecycle local to `InProgressPanel`, since it owns the initial `loadSessions` request. Render the existing quiet centered empty-state layout with a `Loader2` spinner until the request settles, then render the session or no-session state.

**Tech Stack:** React, Zustand, Vitest, Testing Library, lucide-react, project i18n catalogs.

## Global Constraints

- Follow `docs/STYLEGUIDE.md` and existing design tokens.
- Localize all visible copy in every locale.
- Use TDD and run localization verification before completion.

---

### Task 1: Session restore loading state

**Files:**
- Modify: `src/renderer/src/components/todo/detail/InProgressPanel.tsx`
- Test: `src/renderer/src/components/todo/detail/InProgressPanel.test.tsx`
- Modify: `src/renderer/src/i18n/locales/{en,zh,ja,ko,es}.json`

- [x] Write a test with a deferred `loadSessions` promise that expects the loading state and hides the empty-session action.
- [x] Run the focused test and confirm RED.
- [x] Add local loading lifecycle, unmount protection, spinner, and localized status text.
- [x] Add real translations to all locale catalogs.
- [x] Run focused tests, lints, and localization verification.
