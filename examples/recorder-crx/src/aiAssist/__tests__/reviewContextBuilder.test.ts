/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { assert, createLanPropagatedFlow, lanReviewEmittedMap } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const reviewContextBuilderTests: AiAssistTestCase[] = [{
  name: 'AI Review context keeps causal window and flags LAN s007 not emitted before s009',
  run: () => {
    const context = buildRecordingReviewContext(createLanPropagatedFlow(), {
      reviewMode: 'stop-recording',
      emittedCodeMap: lanReviewEmittedMap(),
      exportedCode: '',
      parserSafeCode: '',
    });
    assert(context.reviewSignals.some(signal => signal.stepId === 's007' && signal.kind === 'not-emitted' && signal.severity === 'critical'), 's007 should be a critical not-emitted signal');
    assert(context.reviewSignals.some(signal => signal.stepId === 's007' && signal.kind === 'downstream-state-dependency' && signal.relatedStepIds?.includes('s009')), 's009 dependency should point back to s007');
    assert(JSON.stringify(context).includes('编辑LAN1'), 'context should preserve business dialog text');
    assert(!JSON.stringify(context).includes('localStorage'), 'context should not include browser storage');
  },
}];
