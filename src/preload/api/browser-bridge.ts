import { browserGuestRegistrationAndDownloadsApi } from './browser-bridge-guest-registration-and-downloads'
import { browserNetworkToolsApi } from './browser-bridge-network-tools'
import { browserPageInteractionAndSessionsApi } from './browser-bridge-page-interaction-and-sessions'
import type { PreloadApi } from '../api-types'

export const browserApi = {
  ...browserGuestRegistrationAndDownloadsApi,
  ...browserPageInteractionAndSessionsApi,
  ...browserNetworkToolsApi
} satisfies PreloadApi['browser']
