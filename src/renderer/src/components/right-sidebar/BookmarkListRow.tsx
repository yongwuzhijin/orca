import { Pencil, Trash2 } from 'lucide-react'
import type { BrowserBookmarkLink } from '../../../../shared/browser-workspace-types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

export function BookmarkListRow({
  link,
  icon,
  indent,
  onOpen,
  onEdit,
  onDelete
}: {
  link: BrowserBookmarkLink
  icon: React.ReactNode
  indent?: boolean
  onOpen: () => void
  onEdit?: () => void
  onDelete?: () => void
}): React.JSX.Element {
  return (
    <div
      className={`group flex h-7 items-center gap-1.5 pr-2 hover:bg-sidebar-accent ${indent ? 'pl-7' : 'pl-3'}`}
    >
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
        title={link.url}
        onClick={onOpen}
      >
        {icon}
        <span className="truncate text-[13px] text-sidebar-foreground">{link.title}</span>
      </button>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {onEdit ? (
          <BookmarkIconAction
            label={translate('auto.components.right.sidebar.BookmarksPanel.editAction', 'Edit')}
            onClick={onEdit}
          >
            <Pencil size={13} />
          </BookmarkIconAction>
        ) : null}
        {onDelete ? (
          <BookmarkIconAction
            label={translate('auto.components.right.sidebar.BookmarksPanel.deleteAction', 'Delete')}
            destructive
            onClick={onDelete}
          >
            <Trash2 size={13} />
          </BookmarkIconAction>
        ) : null}
      </div>
    </div>
  )
}

export function BookmarkIconAction({
  label,
  destructive,
  onClick,
  children
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={`flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent ${
            destructive ? 'hover:text-destructive' : 'hover:text-sidebar-foreground'
          }`}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function BookmarkEmptyHint({ text }: { text: string }): React.JSX.Element {
  return <p className="px-3 py-2 text-xs text-muted-foreground">{text}</p>
}
