/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildReplayRepairContext } from '../repair/repairContextBuilder';
import { buildReplayRepairPrompt } from '../repair/repairPrompt';
import { assert, correctLanReviewPatch, createLanPropagatedFlow } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const repairPromptTests: AiAssistTestCase[] = [{
  name: 'AI Repair prompt keeps previous review summary inside bounded context',
  run: () => {
    const context = buildReplayRepairContext({
      flow: createLanPropagatedFlow(),
      failure: { symptomStepId: 's009', errorText: 'strict mode violation', actualBefore: {} },
      previousReviewPatch: correctLanReviewPatch(),
    });
    context.steps = [
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `bulk-${index}`,
        order: index,
        action: 'click',
        sourceCode: `await page.getByText("bulk-${index}-${'z'.repeat(1600)}").click();`,
      })),
      ...context.steps,
    ];
    const prompt = buildReplayRepairPrompt(context, 2600);
    assert(prompt.includes('previousReviewSummary'), 'prompt should put previous review summary in the compact repair context');
    assert(prompt.includes('propagated-failure-risk') || prompt.includes('s007'), 'prompt should preserve previous LAN review diagnosis');
    assert(prompt.includes('s009'), 'prompt should keep symptom step in the causal window');
    assert(prompt.includes('truncated for AI prompt'), 'prompt should middle-truncate oversized repair context');
  },
}];
