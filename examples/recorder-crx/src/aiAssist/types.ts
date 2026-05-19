/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { ReplayRepairContext } from './repair/types';
import type { RecordingReviewContext } from './review/types';

export type AiAssistProviderKind = 'mock' | 'local' | 'private-http' | 'cloud-http' | 'disabled';

export interface AiAssistProvider {
  readonly id: string;
  readonly kind: AiAssistProviderKind;
  reviewRecording(input: {
    context: RecordingReviewContext;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<AiAssistRawResponse>;
  repairReplayFailure(input: {
    context: ReplayRepairContext;
    prompt: string;
    signal?: AbortSignal;
  }): Promise<AiAssistRawResponse>;
}

export interface AiAssistRawResponse {
  providerId: string;
  rawOutput: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    elapsedMs?: number;
  };
  receivedAt: string;
  requestId: string;
}

export interface AiAssistProviderConfig {
  enabled: boolean;
  reviewOnStopRecording: boolean;
  autoApplyLowRiskReviewPatch: boolean;
  repairOnFailureButton: boolean;
  providerKind: AiAssistProviderKind;
  endpoint?: string;
  model?: string;
  maxContextChars: number;
  allowCloudProvider: boolean;
  timeoutMs: number;
  retryLimit: number;
}

export interface AiAssistProviderCallBody {
  model?: string;
  task: 'recording-review' | 'replay-repair';
  prompt: string;
  context: unknown;
  requestId: string;
}

export class AiAssistProviderError extends Error {
  constructor(message: string, readonly requestId: string, readonly providerId: string) {
    super(message);
    this.name = 'AiAssistProviderError';
  }
}
