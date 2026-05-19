/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildReplayRepairContext } from '../repair/repairContextBuilder';
import { assert, correctLanReviewPatch, createLanPropagatedFlow } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const repairContextBuilderTests: AiAssistTestCase[] = [{
  name: 'AI Repair context includes replay failure, first divergence, and causal window',
  run: () => {
    const context = buildReplayRepairContext({
      flow: createLanPropagatedFlow(),
      failure: {
        symptomStepId: 's009',
        errorType: 'strict-mode',
        errorText: 'getByPlaceholder strict mode violation',
        actualBefore: {},
      },
    });
    assert(context.failure.errorText.includes('strict mode'), 'failure error should be included');
    assert(context.causalWindow.rootCauseStepId === 's007', 'repair context should identify upstream s007');
    assert(context.causalWindow.stepIds.includes('s009'), 'causal window should include symptom');
  },
}, {
  name: 'AI Repair context carries previous stop-recording review patch',
  run: () => {
    const context = buildReplayRepairContext({
      flow: createLanPropagatedFlow(),
      failure: { symptomStepId: 's009', errorText: 'not found', actualBefore: {} },
      previousReviewPatch: correctLanReviewPatch(),
    });
    assert(context.previousReview?.patch?.issues[0].rootCauseStepId === 's007', 'previous review patch should be included for repair context');
  },
}];
