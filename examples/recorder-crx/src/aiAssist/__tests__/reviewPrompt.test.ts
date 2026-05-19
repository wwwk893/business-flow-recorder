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
}];
