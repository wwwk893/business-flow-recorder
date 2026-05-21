/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { parseRecordingReviewPatch } from '../review/reviewPatchSchema';
import { validateRecordingReviewPatch } from '../review/reviewValidator';
import { assert, correctLanReviewPatch, createLanPropagatedFlow, lanReviewEmittedMap } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const reviewPatchSchemaTests: AiAssistTestCase[] = [{
  name: 'AI Review patch schema parses structured output and validator rejects raw TypeScript',
  run: () => {
    const flow = createLanPropagatedFlow();
    const context = buildRecordingReviewContext(flow, { emittedCodeMap: lanReviewEmittedMap(), exportedCode: '', parserSafeCode: '' });
    const parsed = parseRecordingReviewPatch(JSON.stringify(correctLanReviewPatch()), context);
    assert(parsed.patches.some(op => op.op === 'force-emit-step'), 'structured force-emit-step patch should parse');
    const rawTsPatch = parseRecordingReviewPatch(JSON.stringify({
      ...correctLanReviewPatch(),
      patches: [{ op: 'replace-locator-scope', stepId: 's009', scope: { code: 'await page.waitForTimeout(300);' }, reason: 'raw TS' }],
    }), context);
    const validation = validateRecordingReviewPatch(flow, context, rawTsPatch);
    assert(!validation.ok, 'raw TypeScript/waitForTimeout should fail validation');
    assert(validation.errors.some(error => /waitForTimeout|raw TypeScript/.test(error)), 'validation should explain raw TypeScript/waitForTimeout risk');
  },
}];
