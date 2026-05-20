/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { AiProviderProfile } from '../aiIntent/types';
import type { CrxSettings } from '../settings';
import type { AiAssistProviderConfig, AiAssistProviderKind } from './types';

export const defaultAiAssistProviderConfig: AiAssistProviderConfig = {
  enabled: false,
  reviewOnStopRecording: false,
  autoApplyLowRiskReviewPatch: false,
  repairOnFailureButton: true,
  providerKind: 'disabled',
  protocol: 'openai-compatible',
  endpoint: '',
  model: '',
  apiKey: '',
  responseMode: 'prompt_json_only',
  thinking: 'omit',
  temperature: 0.1,
  maxTokens: 1200,
  maxContextChars: 28_000,
  allowCloudProvider: false,
  timeoutMs: 60_000,
  retryLimit: 0,
};

export function normalizeAiAssistProviderConfig(config?: Partial<AiAssistProviderConfig>): AiAssistProviderConfig {
  const providerKind = normalizeProviderKind(config?.providerKind);
  const allowCloudProvider = !!config?.allowCloudProvider;
  return {
    ...defaultAiAssistProviderConfig,
    ...config,
    providerKind: providerKind === 'cloud-http' && !allowCloudProvider ? 'disabled' : providerKind,
    allowCloudProvider,
    enabled: !!config?.enabled,
    reviewOnStopRecording: !!config?.reviewOnStopRecording,
    autoApplyLowRiskReviewPatch: !!config?.autoApplyLowRiskReviewPatch,
    repairOnFailureButton: config?.repairOnFailureButton !== false,
    protocol: config?.protocol === 'anthropic-compatible' ? 'anthropic-compatible' : 'openai-compatible',
    endpoint: config?.endpoint?.trim() || '',
    model: config?.model?.trim() || '',
    apiKey: config?.apiKey?.trim() || '',
    responseMode: config?.responseMode || defaultAiAssistProviderConfig.responseMode,
    thinking: config?.thinking || defaultAiAssistProviderConfig.thinking,
    temperature: typeof config?.temperature === 'number' ? config.temperature : defaultAiAssistProviderConfig.temperature,
    maxTokens: clamp(config?.maxTokens ?? defaultAiAssistProviderConfig.maxTokens!, 100, 8000),
    maxContextChars: clamp(config?.maxContextChars ?? defaultAiAssistProviderConfig.maxContextChars, 4000, 120_000),
    timeoutMs: clamp(config?.timeoutMs ?? defaultAiAssistProviderConfig.timeoutMs, 1000, 180_000),
    retryLimit: clamp(config?.retryLimit ?? defaultAiAssistProviderConfig.retryLimit, 0, 2),
  };
}

export function aiAssistConfigFromSettings(settings: CrxSettings, profile?: AiProviderProfile, apiKey = ''): AiAssistProviderConfig {
  const providerKind = settings.aiAssistEnabled ? settings.aiAssistProviderKind || 'private-http' : 'disabled';
  return normalizeAiAssistProviderConfig({
    enabled: !!settings.aiAssistEnabled,
    reviewOnStopRecording: !!settings.aiAssistReviewOnStopRecording,
    autoApplyLowRiskReviewPatch: !!settings.aiAssistAutoApplyLowRiskReviewPatch,
    repairOnFailureButton: settings.aiAssistRepairOnFailureButton !== false,
    providerKind,
    allowCloudProvider: !!settings.aiAssistAllowCloudProvider,
    endpoint: profile?.baseUrl,
    model: profile?.model,
    apiKey,
    protocol: profile?.protocol,
    responseMode: profile?.responseMode,
    thinking: profile?.thinking,
    temperature: profile?.temperature,
    maxTokens: profile?.maxTokens,
    maxContextChars: settings.aiAssistMaxContextChars,
    timeoutMs: settings.aiAssistTimeoutMs ?? profile?.timeoutMs,
    retryLimit: settings.aiAssistRetryLimit,
  });
}

function normalizeProviderKind(kind?: string): AiAssistProviderKind {
  if (kind === 'mock' || kind === 'local' || kind === 'private-http' || kind === 'cloud-http' || kind === 'disabled')
    return kind;
  return 'disabled';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
