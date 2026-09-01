import { Loader2, Lock } from 'lucide-react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { useEffectiveOrcaHomeDirName } from '@/hooks/useEffectiveOrcaHomeDirName'
import { translate } from '@/i18n/i18n'

type TranslateAiApiKeyDialogProps = {
  open: boolean
  configured: boolean
  apiKeyDraft: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onApiKeyDraftChange: (value: string) => void
  onSave: () => void
  onClear: () => void
}

export function TranslateAiApiKeyDialog({
  open,
  configured,
  apiKeyDraft,
  pending,
  onOpenChange,
  onApiKeyDraftChange,
  onSave,
  onClear
}: TranslateAiApiKeyDialogProps): React.JSX.Element {
  const orcaHomeDirName = useEffectiveOrcaHomeDirName()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.TranslateAiApiKeyDialog.title',
              'AI translation API key'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.TranslateAiApiKeyDialog.description',
              'Text is sent to your configured API only when AI translation is selected.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="translate-ai-api-key">
            {translate('auto.components.settings.TranslateAiApiKeyDialog.apiKeyLabel', 'API Key')}
          </Label>
          <Input
            id="translate-ai-api-key"
            type="password"
            value={apiKeyDraft}
            placeholder={
              configured
                ? translate(
                    'auto.components.settings.TranslateAiApiKeyDialog.configuredPlaceholder',
                    'API key configured'
                  )
                : translate(
                    'auto.components.settings.TranslateAiApiKeyDialog.placeholder',
                    'sk-...'
                  )
            }
            disabled={pending}
            onChange={(event) => onApiKeyDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && apiKeyDraft.trim()) {
                onSave()
              }
            }}
          />
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
          <Lock className="size-3 shrink-0" />
          {translate(
            'auto.components.settings.TranslateAiApiKeyDialog.localKeyStorage',
            'Local runtime keys are stored in ~/{{dir}} using Electron encrypted storage when available.',
            { dir: orcaHomeDirName }
          )}
        </p>
        <DialogFooter>
          {configured && (
            <Button variant="outline" disabled={pending} onClick={onClear}>
              {translate('auto.components.settings.TranslateAiApiKeyDialog.clearKey', 'Clear Key')}
            </Button>
          )}
          <Button disabled={pending || !apiKeyDraft.trim()} onClick={onSave}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {translate('auto.components.settings.TranslateAiApiKeyDialog.saveKey', 'Save Key')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
