/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildReplayCausalWindow } from '../repair/causalWindow';
import { assertEqual, createLanPropagatedFlow } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const causalWindowTests: AiAssistTestCase[] = [{
  name: 'AI Repair causal window distinguishes propagated missing dialog from current-step locator',
  run: () => {
    const window = buildReplayCausalWindow(createLanPropagatedFlow(), {
      symptomStepId: 's009',
      errorText: 'locator not found',
      actualBefore: {},
    });
    assertEqual(window.rootCauseStepId, 's007');
    assertEqual(window.symptomStepId, 's009');
  },
}];
