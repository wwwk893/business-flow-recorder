/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { createAiAssistProvider } from '../provider';
import { aiAssistConfigFromSettings, defaultAiAssistProviderConfig } from '../providerConfig';
import { assert, assertEqual, createLanPropagatedFlow, lanReviewEmittedMap } from './testHelpers';
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import type { AiAssistTestCase } from './testHelpers';

export const providerTests: AiAssistTestCase[] = [{
  name: 'AI Assist default provider is disabled and mock provider stays plugin-internal',
  run: async () => {
    const disabled = createAiAssistProvider(defaultAiAssistProviderConfig);
    let failed = false;
    try {
      await disabled.reviewRecording({ context: buildRecordingReviewContext(createLanPropagatedFlow(), { emittedCodeMap: lanReviewEmittedMap() }), prompt: 'prompt' });
    } catch {
      failed = true;
    }
    assert(failed, 'disabled provider should fail closed');

    const mock = createAiAssistProvider({ ...defaultAiAssistProviderConfig, providerKind: 'mock', enabled: true });
    const response = await mock.repairReplayFailure({
      context: {
        schema: 'replay-repair-context/v1',
        flowId: 'flow',
        generatedAt: new Date().toISOString(),
        failure: { symptomStepId: 's001', errorText: 'mock' },
        flowSummary: { stepCount: 0, actionCount: 0 },
        steps: [],
        emittedCodeMap: {},
        replayTrace: { expectedStates: [], actualStates: [], stateDiffs: [] },
        causalWindow: { symptomStepId: 's001', rootCauseStepId: 's001', stepIds: ['s001'], reason: 'mock' },
        locatorDiagnostics: [],
        availableActionCandidates: [],
        redaction: { applied: true, notes: [] },
      },
      prompt: 'prompt',
    });
    assertEqual(response.providerId, 'mock');
    assert(response.rawOutput.includes('replay-repair-patch/v1'), 'mock repair response should be structured JSON');
  },
}, {
  name: 'AI Assist provider config is derived from settings and active AI Provider profile',
  run: () => {
    const config = aiAssistConfigFromSettings({
      aiAssistEnabled: true,
      aiAssistProviderKind: 'private-http',
      aiAssistReviewOnStopRecording: true,
      aiAssistAutoApplyLowRiskReviewPatch: true,
      aiAssistRepairOnFailureButton: true,
      aiAssistMaxContextChars: 32000,
      aiAssistTimeoutMs: 18000,
      aiAssistRetryLimit: 1,
      aiAssistAllowCloudProvider: false,
    } as any, {
      id: 'kimi',
      name: 'kimi',
      protocol: 'openai-compatible',
      baseUrl: 'http://130.94.65.103:8317/v1',
      model: 'kimi-k2.6',
      responseMode: 'prompt_json_only',
      thinking: 'enabled',
      temperature: 0.1,
      maxTokens: 1600,
      timeoutMs: 15000,
      pricing: { currency: 'USD' },
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:00.000Z',
    } as any, 'secret-key');
    assertEqual(config.providerKind, 'private-http');
    assertEqual(config.endpoint, 'http://130.94.65.103:8317/v1');
    assertEqual(config.model, 'kimi-k2.6');
    assertEqual(config.apiKey, 'secret-key');
    assert(config.enabled, 'AI Assist should be enabled from CrxSettings');
    assert(config.reviewOnStopRecording, 'review-on-stop should be enabled from CrxSettings');
  },
}];
