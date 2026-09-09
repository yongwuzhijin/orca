# Upstream Sync via Existing Worktree → `dev_20260726`

Date: 2026-09-01

## Goal

Bring `upstream/main` into the fork while preserving todo orchestrator / AutoPilot, then land the result on `dev_20260726`.

## Preconditions (done)

- `dev_20260726` WIP committed as `00aca5299e` (Qoder transcripts, Cursor workspace mapping, bell icons, explorer fixes).
- Sync worktree clean: `.worktrees/sync/upstream-main-20260827` on `sync/upstream-main-20260827`.
- Main working tree left alone during sync merge.

## Steps

1. In sync worktree only: `git merge upstream/main` (~414 commits, ~42 conflict files expected).
2. Resolve conflicts:
   - Keep fork todo orchestrator / AutoPilot wiring.
   - Prefer upstream for runtime/browser/mobile refactors.
   - Regenerate `pnpm-lock.yaml` after `package.json` resolution.
3. Verify in sync worktree: `pnpm tc` + focused tests; commit as `merge(upstream): …` / `fix(sync): …`.
4. Merge `sync/upstream-main-20260827` into `dev_20260726` (second conflict pass if needed).
5. Verify on `dev_20260726`; do not push unless asked.

## Out of scope

- Force-push, rewriting remote history
- Dropping todo fork features
- Merging into `main` in this pass (optional follow-up)
