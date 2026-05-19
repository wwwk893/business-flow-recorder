/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { repairReplayFailureWithAiAssist } from '../repair/repairService';
import { createAiAssistProvider } from '../provider';
import { defaultAiAssistProviderConfig } from '../providerConfig';
import { assert, correctLanRepairPatch, createLanPropagatedFlow } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const repairLanPropagatedFailureTests: AiAssistTestCase[] = [{
  name: 'AI Repair service mock flow runs provider -> patch -> validate -> apply',
  run: async () => {
    const flow = createLanPropagatedFlow();
    const provider = createAiAssistProvider({ ...defaultAiAssistProviderConfig, enabled: true, providerKind: 'mock' }, () => JSON.stringify(correctLanRepairPatch()));
    const result = await repairReplayFailureWithAiAssist({
      flow,
      provider,
      config: { ...defaultAiAssistProviderConfig, enabled: true, providerKind: 'mock' },
      failure: { symptomStepId: 's009', errorText: 'placeholder strict mode', actualBefore: {} },
    });
    assert(result.validation?.ok, `repair service should validate mock patch: ${result.validation?.errors.join('; ')}`);
    assert(result.validation.appliedFlow?.steps.find(step => step.id === 's007')?.artifacts?.aiAssist?.forceEmit, 'repair applier should mark s007 forceEmit');
  },
}];
