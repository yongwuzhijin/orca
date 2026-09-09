import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const browserNetworkToolsApi = {
  networkListRules: () => ipcRenderer.invoke('browser:network:listRules'),
  networkSaveRules: (args) => ipcRenderer.invoke('browser:network:saveRules', args),
  networkArmRules: (args) => ipcRenderer.invoke('browser:network:armRules', args),
  networkDisarmRules: (args) => ipcRenderer.invoke('browser:network:disarmRules', args),
  networkReadArmedRules: (args) => ipcRenderer.invoke('browser:network:armedRuleIds', args),
  networkReadLog: (args) => ipcRenderer.invoke('browser:network:readLog', args),
  networkSendRequest: (args) => ipcRenderer.invoke('browser:network:sendRequest', args),
  networkCancelRequest: (args) => ipcRenderer.invoke('browser:network:cancelRequest', args)
} satisfies Pick<
  PreloadApi['browser'],
  | 'networkListRules'
  | 'networkSaveRules'
  | 'networkArmRules'
  | 'networkDisarmRules'
  | 'networkReadArmedRules'
  | 'networkReadLog'
  | 'networkSendRequest'
  | 'networkCancelRequest'
>
