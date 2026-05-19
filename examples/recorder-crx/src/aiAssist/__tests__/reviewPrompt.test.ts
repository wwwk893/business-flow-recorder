/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildRecordingReviewContext } from '../review/reviewContextBuilder';
import { buildRecordingReviewPrompt } from '../review/reviewPrompt';
import { assert, createLanPropagatedFlow, lanReviewEmittedMap } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const reviewPromptTests: AiAssistTestCase[] = [{
  name: 'AI Review prompt requires generated code, page context, root cause, and strict JSON',
  run: () => {
    const context = buildRecordingReviewContext(createLanPropagatedFlow(), { emittedCodeMap: lanReviewEmittedMap(), exportedCode: '', parserSafeCode: '' });
    const prompt = buildRecordingReviewPrompt(context);
    assert(prompt.includes('recording-review-patch/v1'), 'prompt should require review patch schema');
    assert(prompt.includes('不要只看单个 locator'), 'prompt should push cross-step state transition review');
    assert(prompt.includes('not emitted'), 'prompt should include deterministic review signals');
    assert(prompt.includes('s007') && prompt.includes('s009'), 'prompt should include causal window steps');
    assert(prompt.includes('不要建议 waitForTimeout'), 'prompt should forbid timeout repair');
  },
}, {
  name: 'AI Review prompt packs review signals before bulky step context',
  run: () => {
    const context = buildRecordingReviewContext(createLanPropagatedFlow(), { emittedCodeMap: lanReviewEmittedMap(), exportedCode: '', parserSafeCode: '' });
    context.steps = [
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `bulk-${index}`,
        order: index,
        action: 'click',
        target: { text: `bulk-${index}`, diagnostics: 'x'.repeat(1600) },
        sourceCode: `await page.getByText("bulk-${index}-${'y'.repeat(1200)}").click();`,
      })),
      ...context.steps,
    ];
    const prompt = buildRecordingReviewPrompt(context, 2400);
    assert(prompt.includes('reviewSignals'), 'prompt should keep deterministic signals in the bounded context');
    assert(prompt.includes('not-emitted') || prompt.includes('not emitted'), 'prompt should keep not-emitted signal details');
    assert(prompt.includes('s007') && prompt.includes('s009'), 'prompt should keep LAN root and affected steps after compaction');
    assert(prompt.includes('truncated for AI prompt'), 'prompt should middle-truncate oversized packed context');
  },
}];
