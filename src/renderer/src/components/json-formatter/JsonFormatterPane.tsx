import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { JsonFormatterInput } from './JsonFormatterInput'
import { JsonFormatterSplitter } from './JsonFormatterSplitter'
import { JsonFormatterToolbar } from './JsonFormatterToolbar'
import { JsonTreeView } from './JsonTreeView'
import { DEFAULT_SPLIT_RATIO } from './json-formatter-split-ratio'
import { toCopyablePath } from './json-path'
import {
  collapseAllJsonNodes,
  createJsonExpansion,
  expandAllJsonNodes,
  toggleJsonNode
} from './json-tree-expansion'
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
        <div className="min-w-0 flex-1 border-l border-border">
          <JsonTreeView
            result={result}
            expansion={expansion}
            showLineNumbers={showLineNumbers}
            onToggle={handleToggle}
            onCopyPath={handleCopyPath}
          />
        </div>
      </div>
    </div>
  )
}
