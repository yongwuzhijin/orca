import Editor from '@monaco-editor/react'
import { useAppStore } from '@/store'
import { resolveDocumentTheme } from '@/lib/document-theme'
import { computeEditorFontSize, resolveEditorFontFamily } from '@/lib/editor-font-zoom'
import '@/lib/monaco-setup'

type JsonFormatterInputProps = {
  value: string
  onChange: (value: string) => void
}

export function JsonFormatterInput({
  value,
  onChange
}: JsonFormatterInputProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')

  return (
    <Editor
      height="100%"
      // Why: the JSON worker is already wired in monaco-setup, so this alone
      // buys inline syntax-error squiggles with no validation code of our own.
      language="json"
      value={value}
      theme={isDark ? 'vs-dark' : 'vs'}
      onChange={(next) => onChange(next ?? '')}
      options={{
        fontSize: computeEditorFontSize(settings?.terminalFontSize ?? 13, editorFontZoomLevel),
        fontFamily: resolveEditorFontFamily(settings),
        lineNumbers: 'on',
        minimap: { enabled: false },
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: 'none'
      }}
    />
  )
}
