/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { applyRecordingReviewPatch } from '../review/reviewPatchApplier';
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
}, {
  name: 'AI Review applier keeps multiple patch operations on the same step',
  run: () => {
    const flow = createLanPropagatedFlow();
    const patch = {
      ...correctLanReviewPatch(),
      patches: [
        { op: 'force-emit-step' as const, stepId: 's007', reason: 'emit row edit' },
        { op: 'replace-recipe' as const, stepId: 's007', recipe: { kind: 'table-row-action', operation: 'edit' }, reason: 'restore row recipe' },
      ],
    };
    const applied = applyRecordingReviewPatch(flow, patch);
    const step = applied.steps.find(item => item.id === 's007');
    assert(step?.artifacts?.aiAssist?.forceEmit, 'force-emit-step should still apply when replace-recipe targets same step');
    assert(step?.uiRecipe?.kind === 'table-row-action', 'replace-recipe should also apply on same step');
    assert((step?.artifacts?.aiAssist?.lastPatchIds || []).length === 2, 'all patch operation ids should be retained');
  },
}];
