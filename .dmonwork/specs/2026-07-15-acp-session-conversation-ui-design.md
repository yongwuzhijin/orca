# ACP Session Conversation UI Design

## Context

The todo execution page already routes Claude, Qoder, and Cursor through the same
`SessionConversation` and normalized `SessionEvent` model. The current renderer,
however, presents tool updates as separate heavy cards and exposes raw JSON without
distinguishing file edits, shell commands, or other tools. Repeated lifecycle updates
for one tool call can therefore appear as duplicate rows.

## Goals

- Keep one engine-neutral conversation UI for every engine in `ACP_ENGINES`.
- Adopt Cursor-inspired progressive disclosure for thoughts, file changes, commands,
  subagent runs, and generic tool activity.
- Merge updates for the same tool call into one stable timeline entry.
- Make all surfaces follow Orca's light, dark, and system theme settings.
- Preserve readable output and safe fallbacks when engines emit different payload shapes.

## Non-goals

- Unifying the todo ACP conversation with Native Chat.
- Changing ACP transport, IPC, persistence, or engine launch behavior.
- Adding engine-specific UI branches.
- Redesigning the todo plan sidebar, permission workflow, or composer behavior.

## Architecture

`SessionConversation` remains the only conversation container used by Claude, Qoder,
and Cursor. It continues to receive normalized `SessionEvent[]`; callers and engine
selection do not affect rendering.

A pure presentation-model function derives stable timeline entries:

- Adjacent `agent_message` chunks are concatenated into one message.
- Adjacent `thought` chunks are concatenated into one thought entry.
- `tool_call` entries with a non-empty matching `toolCallId` are merged at the position
  of their first occurrence. Later defined fields update status, input, and content.
- Tool calls without an ID remain separate to avoid combining unrelated work.
- Other normalized events preserve their original order.

The event renderer dispatches entries to a shared ACP disclosure shell. The shell owns
the chevron, title row, status text, keyboard semantics, animation, and open state.
Detail components own only their content:

- `FileChangeDetails`
- `CommandDetails`
- `SubagentRunDetails`
- `GenericToolDetails`

Tool classification uses normalized `toolKind`, `title`, `rawInput`, and `content`.
Unknown or malformed payloads fall back to the generic detail renderer rather than
introducing engine checks.

## Visual Design

The conversation uses a flat, compact timeline rather than nested cards:

- Small chevrons and concise title rows provide the primary disclosure affordance.
- Muted metadata and subtle borders or guide lines separate activity without competing
  with agent prose.
- Thoughts use de-emphasized text and a localized summary label.
- File changes show the file name and `+N / -N` when counts can be derived. Expanded
  content displays a line-numbered unified diff.
- Commands show a concise command summary and live status. Expanded content uses the
  app monospace font for the complete command and output, with a bounded scroll area.
- Subagent runs show a spinner while active, followed by the task name and model when
  available. A muted second line names the current stage. Completion replaces the
  spinner with a static state in place; the disclosure retains the final summary or
  result for later inspection.
- Generic tools show readable text where available and formatted JSON as a fallback.

File diff additions and deletions use the existing Git decoration tokens. All other
surfaces use `background`, `card`, `muted`, `accent`, `border`, and matching foreground
tokens. Components contain no theme detection and no hardcoded light/dark colors; the
existing document theme classes and CSS variables provide automatic adaptation.

## Disclosure Behavior

- A newly observed running tool entry opens automatically.
- A user's first manual toggle makes that entry user-controlled; later status or
  content updates do not override the chosen state.
- Completion does not force an entry closed.
- Thoughts and already-completed historical entries start collapsed.
- The entire trigger is operable by pointer, Enter, and Space and exposes
  `aria-expanded`.
- Expansion motion is subtle and disabled under reduced-motion preferences.

## Data Handling and Failure Modes

Payload parsing is conservative and side-effect free. It supports object, text, and
common ACP content-block shapes without assuming one engine's schema. Missing paths,
commands, status, diff data, or output produce a reduced but usable generic entry.
Rendering one malformed payload must not prevent later events from appearing.

Long command output and generic JSON are retained but displayed in bounded,
independently scrollable regions. Updating an existing tool entry preserves its
timeline position so streaming status changes do not move the viewport.

## Localization

Every new visible label, status fallback, accessible name, and empty-detail message
uses `translate()` and is added with real translations to all locale catalogs:
English, Chinese, Japanese, Korean, and Spanish.

## Test Strategy

Unit tests cover:

- adjacent message and thought chunk concatenation;
- tool lifecycle merging, latest-field precedence, and stable ordering;
- non-merging behavior for missing IDs;
- file, command, and generic tool classification;
- subagent task/model/stage extraction plus running-to-completed presentation;
- malformed payload fallback;
- automatic opening for running entries and persistence of manual choices;
- pointer and keyboard toggling plus `aria-expanded`;
- file diff and command output rendering.

Component verification covers both light and dark document themes using semantic token
classes. Completion verification runs focused Vitest suites, type checking, lint, and
the localization catalog sync, catalog verification, and coverage verification scripts.
Manual visual verification checks light/dark rendering and an in-place
running-to-completed transition.
