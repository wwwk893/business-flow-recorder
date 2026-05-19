/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { parseRecordingReviewPatch } from '../review/reviewPatchSchema';
import { assert, correctLanReviewPatch, createLanPropagatedFlow, lanReviewEmittedMap } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const reviewPatchSchemaTests: AiAssistTestCase[] = [{
  name: 'AI Review patch schema rejects raw TypeScript and accepts structured patch',
  run: () => {
    const context = buildRecordingReviewContext(createLanPropagatedFlow(), { emittedCodeMap: lanReviewEmittedMap(), exportedCode: '', parserSafeCode: '' });
    const parsed = parseRecordingReviewPatch(JSON.stringify(correctLanReviewPatch()), context);
    assert(parsed.patches.some(op => op.op === 'force-emit-step'), 'structured force-emit-step patch should parse');
    let rejected = false;
    try {
      parseRecordingReviewPatch(JSON.stringify({
        ...correctLanReviewPatch(),
        patches: [{ op: 'replace-locator-scope', stepId: 's009', scope: { code: 'await page.waitForTimeout(300);' }, reason: 'raw TS' }],
      }), context);
    } catch {
      rejected = true;
    }
    assert(rejected, 'raw TypeScript/waitForTimeout should be rejected');
  },
}];
