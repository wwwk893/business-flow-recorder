/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { normalizeAiAssistProviderConfig } from './providerConfig';
import { redactAiAssistContext, redactAiAssistText } from './redactor';
import type { AiAssistProvider, AiAssistProviderCallBody, AiAssistProviderConfig, AiAssistRawResponse } from './types';
import { AiAssistProviderError } from './types';

export class DisabledProvider implements AiAssistProvider {
  readonly id = 'disabled';
  readonly kind = 'disabled' as const;

  async reviewRecording(): Promise<AiAssistRawResponse> {
    throw this.error();
  }

  async repairReplayFailure(): Promise<AiAssistRawResponse> {
    throw this.error();
  }

  private error() {
    const requestId = createAiAssistRequestId();
    return new AiAssistProviderError('AI Assist provider is disabled. Configure a local/private provider to run review or repair.', requestId, this.id);
  }
}

export class MockProvider implements AiAssistProvider {
  readonly id = 'mock';
  readonly kind = 'mock' as const;

  constructor(private readonly responseFactory?: (task: 'recording-review' | 'replay-repair') => string) {}

  async reviewRecording(): Promise<AiAssistRawResponse> {
    return this.response('recording-review');
  }

  async repairReplayFailure(): Promise<AiAssistRawResponse> {
    return this.response('replay-repair');
  }

  private response(task: 'recording-review' | 'replay-repair'): AiAssistRawResponse {
    const rawOutput = this.responseFactory?.(task) || (task === 'recording-review' ? mockReviewPatch() : mockRepairPatch());
    return {
      providerId: this.id,
      rawOutput: redactAiAssistText(rawOutput),
      usage: { elapsedMs: 0 },
      receivedAt: new Date().toISOString(),
      requestId: createAiAssistRequestId(),
    };
  }
}

export class HttpAiAssistProvider implements AiAssistProvider {
  readonly id: string;
  readonly kind: 'local' | 'private-http' | 'cloud-http';
  private readonly config: AiAssistProviderConfig;

  constructor(kind: 'local' | 'private-http' | 'cloud-http', config: AiAssistProviderConfig) {
    this.kind = kind;
    this.id = kind;
    this.config = normalizeAiAssistProviderConfig(config);
  }

  async reviewRecording(input: Parameters<AiAssistProvider['reviewRecording']>[0]): Promise<AiAssistRawResponse> {
    return this.call('recording-review', input.context, input.prompt, input.signal);
  }

  async repairReplayFailure(input: Parameters<AiAssistProvider['repairReplayFailure']>[0]): Promise<AiAssistRawResponse> {
    return this.call('replay-repair', input.context, input.prompt, input.signal);
  }

  private async call(task: 'recording-review' | 'replay-repair', context: unknown, prompt: string, signal?: AbortSignal): Promise<AiAssistRawResponse> {
    if (this.kind === 'cloud-http' && !this.config.allowCloudProvider)
      throw new AiAssistProviderError('Cloud AI provider is not enabled for AI Assist.', createAiAssistRequestId(), this.id);
    if (!this.config.enabled)
      throw new AiAssistProviderError('AI Assist is disabled by feature flag.', createAiAssistRequestId(), this.id);
    if (!this.config.endpoint)
      throw new AiAssistProviderError('AI Assist endpoint is empty.', createAiAssistRequestId(), this.id);

    const requestId = createAiAssistRequestId();
    const redactedContext = redactAiAssistContext(context).value;
    const body: AiAssistProviderCallBody = {
      model: this.config.model || undefined,
      task,
      prompt: redactAiAssistText(prompt, this.config.maxContextChars),
      context: redactedContext,
      requestId,
    };

    const startedAt = performanceNow();
    const raw = await retry(() => fetchJson(this.config.endpoint!, body, this.config.timeoutMs, signal), this.config.retryLimit);
    const rawOutput = normalizeRawOutput(raw);
    return {
      providerId: this.id,
      rawOutput: redactAiAssistText(rawOutput),
      usage: {
        inputTokens: numberOrUndefined((raw as any)?.usage?.inputTokens ?? (raw as any)?.usage?.prompt_tokens),
        outputTokens: numberOrUndefined((raw as any)?.usage?.outputTokens ?? (raw as any)?.usage?.completion_tokens),
        elapsedMs: Math.round(performanceNow() - startedAt),
      },
      receivedAt: new Date().toISOString(),
      requestId: String((raw as any)?.requestId || requestId),
    };
  }
}

export function createAiAssistProvider(config?: Partial<AiAssistProviderConfig>, mockFactory?: (task: 'recording-review' | 'replay-repair') => string): AiAssistProvider {
  const normalized = normalizeAiAssistProviderConfig(config);
  if (normalized.providerKind === 'mock')
    return new MockProvider(mockFactory);
  if (normalized.providerKind === 'local' || normalized.providerKind === 'private-http' || normalized.providerKind === 'cloud-http')
    return new HttpAiAssistProvider(normalized.providerKind, normalized);
  return new DisabledProvider();
}

export function createAiAssistRequestId() {
  return `aiassist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchJson(endpoint: string, body: AiAssistProviderCallBody, timeoutMs: number, outerSignal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  outerSignal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(`HTTP ${response.status}: ${redactAiAssistText(text, 400) || response.statusText}`);
    return text ? JSON.parse(text) : {};
  } finally {
    window.clearTimeout(timeout);
    outerSignal?.removeEventListener('abort', abort);
  }
}

async function retry<T>(fn: () => Promise<T>, retryLimit: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function normalizeRawOutput(raw: unknown) {
  const anyRaw = raw as any;
  const text = anyRaw?.rawOutput ?? anyRaw?.output ?? anyRaw?.text ?? anyRaw?.choices?.[0]?.message?.content;
  if (typeof text === 'string')
    return text;
  return JSON.stringify(raw);
}

function numberOrUndefined(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function performanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function mockReviewPatch() {
  return JSON.stringify({
    schema: 'recording-review-patch/v1',
    diagnosis: { overallRisk: 'low', summary: 'Mock review found no blocking issue.', issueCount: 0 },
    issues: [],
    patches: [],
    validationPlan: ['Mock provider does not validate runtime replay.'],
    autoApplyEligibility: { eligible: false, reason: 'Mock provider produced no patch.', maxRisk: 'low' },
  });
}

function mockRepairPatch() {
  return JSON.stringify({
    schema: 'replay-repair-patch/v1',
    diagnosis: {
      failureKind: 'unsafe-repair-rejected',
      symptomStepId: '',
      rootCauseStepId: '',
      confidence: 0,
      reason: 'Mock provider does not repair replay failures.',
    },
    patches: [],
    validationPlan: ['Mock provider does not validate runtime replay.'],
    risk: { level: 'high', unsafePatterns: [], notes: 'mock' },
  });
}
