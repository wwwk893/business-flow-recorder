/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export type CrxSettings = {
  testIdAttributeName: string;
  targetLanguage: string;
  sidepanel?: boolean;
  experimental?: boolean;
  playInIncognito: boolean;
  businessFlowEnabled?: boolean;
  semanticAdapterEnabled?: boolean;
  semanticAdapterDiagnosticsEnabled?: boolean;
  defaultApp?: string;
  defaultRepo?: string;
  defaultRole?: string;
  redactSensitiveData?: boolean;
  aiAssistEnabled?: boolean;
  aiAssistReviewOnStopRecording?: boolean;
  aiAssistAutoApplyLowRiskReviewPatch?: boolean;
  aiAssistRepairOnFailureButton?: boolean;
  aiAssistProviderKind?: 'mock' | 'local' | 'private-http' | 'cloud-http' | 'disabled';
  aiAssistAllowCloudProvider?: boolean;
  aiAssistMaxContextChars?: number;
  aiAssistTimeoutMs?: number;
  aiAssistRetryLimit?: number;
};

export const defaultSettings: CrxSettings = {
  testIdAttributeName: 'data-testid',
  targetLanguage: 'playwright-test',
  sidepanel: true,
  experimental: false,
  playInIncognito: false,
  businessFlowEnabled: true,
  semanticAdapterEnabled: true,
  semanticAdapterDiagnosticsEnabled: false,
  defaultApp: '',
  defaultRepo: '',
  defaultRole: '',
  redactSensitiveData: true,
  aiAssistEnabled: false,
  aiAssistReviewOnStopRecording: false,
  aiAssistAutoApplyLowRiskReviewPatch: false,
  aiAssistRepairOnFailureButton: true,
  aiAssistProviderKind: 'private-http',
  aiAssistAllowCloudProvider: false,
  aiAssistMaxContextChars: 28_000,
  aiAssistTimeoutMs: 20_000,
  aiAssistRetryLimit: 0,
};

const settingsStorageKeys: (keyof CrxSettings)[] = [
  'testIdAttributeName',
  'targetLanguage',
  'sidepanel',
  'playInIncognito',
  'experimental',
  'businessFlowEnabled',
  'semanticAdapterEnabled',
  'semanticAdapterDiagnosticsEnabled',
  'defaultApp',
  'defaultRepo',
  'defaultRole',
  'redactSensitiveData',
  'aiAssistEnabled',
  'aiAssistReviewOnStopRecording',
  'aiAssistAutoApplyLowRiskReviewPatch',
  'aiAssistRepairOnFailureButton',
  'aiAssistProviderKind',
  'aiAssistAllowCloudProvider',
  'aiAssistMaxContextChars',
  'aiAssistTimeoutMs',
  'aiAssistRetryLimit',
];

export async function loadSettings(): Promise<CrxSettings> {
  const [isAllowedIncognitoAccess, loadedPreferences] = await Promise.all([
    chrome.extension.isAllowedIncognitoAccess(),
    chrome.storage.sync.get(settingsStorageKeys) as Partial<CrxSettings>,
  ]);
  return { ...defaultSettings, ...loadedPreferences, playInIncognito: !!loadedPreferences.playInIncognito && isAllowedIncognitoAccess };
}

export async function storeSettings(settings: CrxSettings) {
  await chrome.storage.sync.set(settings);
}

const listeners = new Map<(settings: CrxSettings) => void, any>();

export function addSettingsChangedListener(listener: (settings: CrxSettings) => void) {
  const wrappedListener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (!settingsStorageKeys.some(key => changes[key]))
      return;

    loadSettings().then(listener).catch(() => {});
  };
  listeners.set(listener, wrappedListener);
  chrome.storage.sync.onChanged.addListener(wrappedListener);
}

export function removeSettingsChangedListener(listener: (settings: CrxSettings) => void) {
  const wrappedListener = listeners.get(listener);
  if (!wrappedListener)
    return;
  chrome.storage.sync.onChanged.removeListener(wrappedListener);
}
