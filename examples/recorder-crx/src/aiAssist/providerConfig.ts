/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { AiAssistProviderConfig, AiAssistProviderKind } from './types';

export const defaultAiAssistProviderConfig: AiAssistProviderConfig = {
  enabled: false,
  reviewOnStopRecording: false,
  autoApplyLowRiskReviewPatch: false,
  repairOnFailureButton: true,
  providerKind: 'disabled',
  endpoint: '',
  model: '',
  maxContextChars: 28_000,
  allowCloudProvider: false,
  timeoutMs: 20_000,
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
    endpoint: config?.endpoint?.trim() || '',
    model: config?.model?.trim() || '',
    maxContextChars: clamp(config?.maxContextChars ?? defaultAiAssistProviderConfig.maxContextChars, 4000, 120_000),
    timeoutMs: clamp(config?.timeoutMs ?? defaultAiAssistProviderConfig.timeoutMs, 1000, 120_000),
    retryLimit: clamp(config?.retryLimit ?? defaultAiAssistProviderConfig.retryLimit, 0, 2),
  };
}

function normalizeProviderKind(kind?: string): AiAssistProviderKind {
  if (kind === 'mock' || kind === 'local' || kind === 'private-http' || kind === 'cloud-http' || kind === 'disabled')
    return kind;
  return 'disabled';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
