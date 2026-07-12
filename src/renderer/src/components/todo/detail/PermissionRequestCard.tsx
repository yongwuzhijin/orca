import React from 'react'
import { Button } from '@/components/ui/button'
import type {
  PermissionRequest,
  PermissionRequestOption
} from '../../../../../shared/acp/session-event'

type PermissionRequestCardProps = {
  request: PermissionRequest
  onResolve: (requestId: string, optionId: string) => void
  onSwitchAuto: () => void
}

// Why: spec §2.3 — "always allow" class options additionally flip the session to
// auto mode. Detect via kind or optionId so engine-specific naming still matches.
export function isAlwaysAllowOption(option: PermissionRequestOption): boolean {
  return option.kind === 'allow_always' || option.optionId.includes('always')
}

export function PermissionRequestCard({
  request,
  onResolve,
  onSwitchAuto
}: PermissionRequestCardProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="text-sm font-medium text-foreground">{request.toolCall.title}</div>
      <div className="flex flex-wrap gap-2">
        {request.options.map((option) => (
          <Button
            key={option.optionId}
            size="sm"
            variant={option.kind === 'reject_once' ? 'outline' : 'default'}
            onClick={() => {
              onResolve(request.requestId, option.optionId)
              if (isAlwaysAllowOption(option)) {
                onSwitchAuto()
              }
            }}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
