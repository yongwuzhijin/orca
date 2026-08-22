// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/dropdown-menu', () => dropdownMenuStubs())
vi.mock('@/store', () => ({ useAppStore: appStoreStub() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { useBrowserNetworkToolsPanel } from '../network-tools/browser-network-tools-panel-state'
import { BrowserToolbarMenuDropdown } from './browser-toolbar-menu-dropdown'

const onMenuOpenChange = vi.fn()

function renderMenu(): void {
  render(
    <BrowserToolbarMenuDropdown
      menuOpen
      onMenuOpenChange={onMenuOpenChange}
      allProfiles={[]}
      effectiveProfileId="default"
      onSwitchProfile={vi.fn()}
      onNewProfile={vi.fn()}
      detectedBrowsers={[]}
      onFetchDetectedBrowsers={vi.fn()}
      browserSessionImportState={null}
      onImportFromBrowser={vi.fn()}
      onImportFromFile={vi.fn()}
      viewportPresetId={null}
      onApplyViewportPreset={vi.fn()}
      worktreeId="wt-1"
      pageUrl="https://example.com"
      pageTitle="Example"
      browserPageId="page-1"
    />
  )
}

beforeEach(() => {
  onMenuOpenChange.mockClear()
  useBrowserNetworkToolsPanel.getState().close()
})

afterEach(cleanup)

describe('browser toolbar menu network tools item', () => {
  it('opens the drawer for the pane that owns the menu', async () => {
    renderMenu()
    await userEvent.click(screen.getByText('Network tools'))
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
  })

  it('dismisses the menu so the drawer is not covered by it', async () => {
    renderMenu()
    await userEvent.click(screen.getByText('Network tools'))
    expect(onMenuOpenChange).toHaveBeenCalledWith(false)
  })
})

function dropdownMenuStubs(): Record<string, unknown> {
  const passthrough = ({ children }: { children?: ReactNode }): ReactNode => children
  const block = ({ children }: { children?: ReactNode }): ReactNode => <div>{children}</div>
  return {
    DropdownMenu: passthrough,
    DropdownMenuContent: block,
    DropdownMenuItem: ({
      children,
      disabled,
      onSelect
    }: {
      children?: ReactNode
      disabled?: boolean
      onSelect?: (event: Event) => void
    }): ReactNode => (
      <button disabled={disabled} onClick={() => onSelect?.(new Event('menu.itemSelect'))}>
        {children}
      </button>
    ),
    DropdownMenuLabel: block,
    DropdownMenuPortal: passthrough,
    DropdownMenuRadioGroup: passthrough,
    DropdownMenuRadioItem: block,
    DropdownMenuSeparator: () => <hr />,
    DropdownMenuSub: passthrough,
    DropdownMenuSubContent: block,
    DropdownMenuSubTrigger: block,
    DropdownMenuTrigger: passthrough
  }
}

function appStoreStub(): unknown {
  const state = {
    getKnownWorktreeById: vi.fn(() => null),
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    settings: { browserQuickLinkFolders: [] }
  }
  const useAppStore = (selector?: (s: typeof state) => unknown): unknown =>
    selector ? selector(state) : state
  useAppStore.getState = (): typeof state => state
  return useAppStore
}
