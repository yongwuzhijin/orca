import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

type SessionDisclosureProps = {
  entryKey: string
  title: ReactNode
  meta?: ReactNode
  running?: boolean
  defaultOpen?: boolean
  children: ReactNode
}

export function SessionDisclosure({
  entryKey,
  ...props
}: SessionDisclosureProps): React.JSX.Element {
  // The keyed boundary makes disclosure state belong to one timeline entry without an effect-frame flash.
  return <SessionDisclosureState key={entryKey} entryKey={entryKey} {...props} />
}

function SessionDisclosureState({
  entryKey,
  title,
  meta,
  running = false,
  defaultOpen = false,
  children
}: SessionDisclosureProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen || running)
  const userToggledRef = useRef(false)

  useEffect(() => {
    // Live entries stay visible until the user makes an explicit disclosure choice.
    if (running && !userToggledRef.current) {
      setOpen(true)
    }
  }, [running])

  return (
    <Collapsible
      data-entry-key={entryKey}
      open={open}
      onOpenChange={(nextOpen) => {
        userToggledRef.current = true
        setOpen(nextOpen)
      }}
    >
      <CollapsibleTrigger
        type="button"
        className="group flex w-full items-center gap-1.5 rounded-md py-1 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-90"
        />
        <span className="min-w-0 flex-1">{title}</span>
        {meta ? <span className="shrink-0">{meta}</span> : null}
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
