import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { JsonFormatterInput } from './JsonFormatterInput'
import { JsonFormatterSplitter } from './JsonFormatterSplitter'
import { JsonFormatterToolbar } from './JsonFormatterToolbar'
import { JsonSearchBar } from './JsonSearchBar'
import { JsonTreeView } from './JsonTreeView'
import type { JsonRowActionHandlers } from './JsonTreeRowActions'
import { buildJsonPairText, buildJsonValueText } from './json-copy-text'
import { deleteJsonNodeAt } from './json-delete-node'
import { DEFAULT_SPLIT_RATIO } from './json-formatter-split-ratio'
import { toCopyablePath } from './json-path'
import { findJsonMatches } from './json-search'
import {
  collapseAllJsonNodes,
  createJsonExpansion,
  expandAllJsonNodes,
  expandJsonAncestors,
  pruneJsonSubtreeOverrides,
  toggleJsonNode
} from './json-tree-expansion'
import type { JsonTreeRow as JsonTreeRowData } from './json-tree-rows'
import { type JsonParseResult, parseJsonInput } from './parse-json-input'

const PARSE_DEBOUNCE_MS = 200

type JsonFormatterPaneProps = {
  fileId: string
  input: string
  keepEscapes: boolean
  showLineNumbers: boolean
}

export function JsonFormatterPane({
  fileId,
  input,
  keepEscapes,
  showLineNumbers
}: JsonFormatterPaneProps): React.JSX.Element {
  const updateJsonFormatterState = useAppStore((state) => state.updateJsonFormatterState)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(DEFAULT_SPLIT_RATIO)
  const [expansion, setExpansion] = useState(createJsonExpansion)
  const [result, setResult] = useState<JsonParseResult>(() =>
    parseJsonInput(input, { keepEscapes })
  )
  const [query, setQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  const matches = useMemo(
    () => (result.status === 'ok' ? findJsonMatches(result.value, query) : []),
    [result, query]
  )
  // Why: derived clamping instead of an effect — deleting a matched node must not cost an extra render.
  const clampedIndex = matches.length === 0 ? -1 : Math.min(activeMatchIndex, matches.length - 1)
  const activeMatch = clampedIndex < 0 ? null : (matches[clampedIndex] ?? null)
  const activeMatchPath = activeMatch?.path ?? null

  useEffect(() => {
    if (activeMatchPath === null) {
      return
    }
    setExpansion((prev) => expandJsonAncestors(prev, activeMatchPath))
  }, [activeMatchPath])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setResult(parseJsonInput(input, { keepEscapes }))
    }, PARSE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [input, keepEscapes])

  const formatted = useMemo(
    () => (result.status === 'ok' ? JSON.stringify(result.value, null, 2) : null),
    [result]
  )

  const copyToClipboard = useCallback((text: string, message: string) => {
    // Why: this renderer is sandboxed, so navigator.clipboard is unavailable —
    // clipboard writes have to go through the trusted IPC bridge.
    void window.api.ui
      .writeClipboardText(text)
      .then(() => toast.success(message))
      .catch(() =>
        toast.error(
          translate('auto.components.jsonFormatter.pane.copyFailed.7b3ce0a915', 'Copy failed')
        )
      )
  }, [])

  const handleCopyPath = useCallback(
    (path: string) => {
      copyToClipboard(
        toCopyablePath(path),
        translate('auto.components.jsonFormatter.pane.pathCopied.5d94b1ea38', 'Path copied')
      )
    },
    [copyToClipboard]
  )

  const handleCopyPair = useCallback(
    (row: JsonTreeRowData) => {
      copyToClipboard(
        buildJsonPairText(row),
        translate('auto.components.jsonFormatter.pane.pairCopied.9d3b74e0a5', 'Copied')
      )
    },
    [copyToClipboard]
  )

  const handleCopyValue = useCallback(
    (row: JsonTreeRowData) => {
      copyToClipboard(
        buildJsonValueText(row),
        translate('auto.components.jsonFormatter.pane.valueCopied.2c8f5a19d7', 'Value copied')
      )
    },
    [copyToClipboard]
  )

  const handleDelete = useCallback(
    (row: JsonTreeRowData) => {
      if (result.status !== 'ok' || row.segments.length === 0) {
        return
      }
      const previousInput = input
      const next = deleteJsonNodeAt(result.value, row.segments)
      updateJsonFormatterState(fileId, { input: JSON.stringify(next, null, 2) })
      // Why: parsing is debounced, so without this the deleted row lingers for PARSE_DEBOUNCE_MS.
      setResult({ status: 'ok', value: next })
      setExpansion((prev) => pruneJsonSubtreeOverrides(prev, row.path))
      toast.success(
        translate('auto.components.jsonFormatter.pane.nodeDeleted.6e1b93d84f', 'Deleted {{path}}', {
          path: toCopyablePath(row.path)
        }),
        {
          action: {
            label: translate('auto.components.jsonFormatter.pane.undo.71c5a8f2e9', 'Undo'),
            // Why: the click leaves focus in the right pane, so ⌘Z never reaches Monaco.
            onClick: () => {
              updateJsonFormatterState(fileId, { input: previousInput })
            }
          }
        }
      )
    },
    [fileId, input, result, updateJsonFormatterState]
  )

  const rowActions = useMemo<JsonRowActionHandlers>(
    () => ({
      onCopyPair: handleCopyPair,
      onCopyPath: handleCopyPath,
      onCopyValue: handleCopyValue,
      onDelete: handleDelete
    }),
    [handleCopyPair, handleCopyPath, handleCopyValue, handleDelete]
  )

  const handleQueryChange = useCallback((next: string) => {
    setQuery(next)
    setActiveMatchIndex(0)
  }, [])

  const handleMoveToMatch = useCallback(
    (direction: 1 | -1) => {
      setActiveMatchIndex((prev) => {
        if (matches.length === 0) {
          return 0
        }
        const current = Math.min(prev, matches.length - 1)
        return (current + direction + matches.length) % matches.length
      })
    },
    [matches.length]
  )

  const handleCopyFormatted = useCallback(() => {
    if (formatted === null) {
      return
    }
    copyToClipboard(
      formatted,
      translate('auto.components.jsonFormatter.pane.jsonCopied.c0f47b6e12', 'JSON copied')
    )
  }, [copyToClipboard, formatted])

  const handleToggle = useCallback((path: string) => {
    setExpansion((prev) => toggleJsonNode(prev, path))
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <JsonFormatterToolbar
        canFormat={formatted !== null}
        showLineNumbers={showLineNumbers}
        keepEscapes={keepEscapes}
        onFormat={() => {
          if (formatted !== null) {
            updateJsonFormatterState(fileId, { input: formatted })
          }
        }}
        onCollapseAll={() => setExpansion(collapseAllJsonNodes())}
        onExpandAll={() => setExpansion(expandAllJsonNodes())}
        onToggleLineNumbers={() =>
          updateJsonFormatterState(fileId, { showLineNumbers: !showLineNumbers })
        }
        onToggleKeepEscapes={(value) => updateJsonFormatterState(fileId, { keepEscapes: value })}
        onCopy={handleCopyFormatted}
        onClear={() => updateJsonFormatterState(fileId, { input: '' })}
      />
      <div ref={containerRef} className="flex min-h-0 flex-1">
        <div className="min-w-0 overflow-hidden" style={{ width: `${ratio * 100}%` }}>
          <JsonFormatterInput
            value={input}
            onChange={(next) => updateJsonFormatterState(fileId, { input: next })}
          />
        </div>
        <JsonFormatterSplitter containerRef={containerRef} onRatioChange={setRatio} />
        <div className="flex min-w-0 flex-1 flex-col border-l border-border">
          <JsonSearchBar
            query={query}
            matchCount={matches.length}
            activeMatchIndex={clampedIndex}
            onQueryChange={handleQueryChange}
            onMoveToMatch={handleMoveToMatch}
          />
          <div className="min-h-0 flex-1">
            <JsonTreeView
              result={result}
              expansion={expansion}
              showLineNumbers={showLineNumbers}
              query={query}
              activeMatch={activeMatch}
              onToggle={handleToggle}
              actions={rowActions}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
