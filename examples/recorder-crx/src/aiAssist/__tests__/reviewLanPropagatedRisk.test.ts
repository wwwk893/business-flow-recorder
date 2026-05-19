/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { assert, createLanPropagatedFlow, lanReviewEmittedMap } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const reviewLanPropagatedRiskTests: AiAssistTestCase[] = [{
  name: 'AI Review LAN fixture surfaces s007 -> s009 propagated risk at stop-recording time',
  run: () => {
    const context = buildRecordingReviewContext(createLanPropagatedFlow(), {
      reviewMode: 'stop-recording',
      emittedCodeMap: lanReviewEmittedMap(),
      exportedCode: '',
      parserSafeCode: '',
    });
    const transition = context.stateTransitions.find(item => item.stepId === 's007');
    assert(transition?.expectedEffect === 'opens-dialog', 's007 should be modeled as dialog opener');
    assert(transition.requiredByLaterStepIds?.includes('s009'), 's009 should require s007 state transition');
    assert(context.generatedArtifacts.emittedCodeMap.s007.emitted === false, 'fixture should simulate skipped s007');
  },
}];
