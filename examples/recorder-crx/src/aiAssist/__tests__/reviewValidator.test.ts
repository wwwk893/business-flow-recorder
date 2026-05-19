/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { validateRecordingReviewPatch } from '../review/reviewValidator';
import { assert, correctLanReviewPatch, createLanPropagatedFlow, lanReviewEmittedMap, placeholderOnlyReviewPatch } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const reviewValidatorTests: AiAssistTestCase[] = [{
  name: 'AI Review validator accepts propagated root patch and rejects symptom-only placeholder patch',
  run: () => {
    const flow = createLanPropagatedFlow();
    const context = buildRecordingReviewContext(flow, { emittedCodeMap: lanReviewEmittedMap(), exportedCode: '', parserSafeCode: '' });
    const good = validateRecordingReviewPatch(flow, context, correctLanReviewPatch());
    assert(good.ok, `correct propagated patch should validate: ${good.errors.join('; ')}`);
    assert(!good.autoApply, 'high risk propagated review patch should not auto apply');

    const bad = validateRecordingReviewPatch(flow, context, placeholderOnlyReviewPatch());
    assert(!bad.ok, 'placeholder-only patch should not pass propagated validation');
    assert(bad.errors.some(error => error.includes('root cause')), 'validator should explain root cause requirement');
  },
}];
