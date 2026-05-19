/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { createAiAssistProvider } from '../provider';
import { defaultAiAssistProviderConfig } from '../providerConfig';
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
}];
