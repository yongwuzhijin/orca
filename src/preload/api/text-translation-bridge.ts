import { ipcRenderer } from 'electron'
import type { TextTranslationApi } from './text-translation-api'

export const textTranslationApi = {
  translate: (request) => ipcRenderer.invoke('translation:translate', request),
  translateWithAi: (request) => ipcRenderer.invoke('translation:translateWithAi', request),
  cancelAi: () => ipcRenderer.invoke('translation:cancelAi'),
  lookupDictionary: (request) => ipcRenderer.invoke('translation:lookupDictionary', request),
  getAiApiKeyStatus: () => ipcRenderer.invoke('translation:getAiApiKeyStatus'),
  saveAiApiKey: (apiKey) => ipcRenderer.invoke('translation:saveAiApiKey', apiKey),
  clearAiApiKey: () => ipcRenderer.invoke('translation:clearAiApiKey')
} satisfies TextTranslationApi
