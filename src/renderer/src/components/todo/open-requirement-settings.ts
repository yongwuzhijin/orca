import { useAppStore } from '@/store'

export type RequirementSettingsTab = 'start-task' | 'clarification'

const REQUIREMENT_SETTINGS_TAB_KEY = 'orca:requirement-settings-tab'

export function openRequirementSettings(tab: RequirementSettingsTab = 'start-task'): void {
  sessionStorage.setItem(REQUIREMENT_SETTINGS_TAB_KEY, tab)
  const { openSettingsPage, openSettingsTarget } = useAppStore.getState()
  openSettingsTarget({
    pane: 'requirement-settings',
    repoId: null,
    sectionId: tab === 'clarification' ? 'requirement-settings-clarification' : undefined
  })
  openSettingsPage()
}

export function consumeRequirementSettingsTab(): RequirementSettingsTab {
  const stored = sessionStorage.getItem(REQUIREMENT_SETTINGS_TAB_KEY)
  sessionStorage.removeItem(REQUIREMENT_SETTINGS_TAB_KEY)
  if (stored === 'clarification' || stored === 'start-task') {
    return stored
  }
  return 'start-task'
}
