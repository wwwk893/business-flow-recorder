/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { redactAiAssistText } from '../redactor';
import type { ReplayRepairContext } from './types';

export function buildReplayRepairPrompt(context: ReplayRepairContext, maxContextChars = 28_000) {
  const boundedContext = redactAiAssistText(JSON.stringify(context), maxContextChars);
  return [
    'You are the Business Flow Recorder replay repair agent.',
    'Do not only repair the failing line. First find the first divergence and root cause step.',
    'If the current failed step expects a dialog/form/table state that is missing in actual replay, inspect previous steps and patch the upstream missing/wrong/skipped step.',
    'AI can only return replay-repair-patch/v1 JSON. Do not return Markdown. Do not return TypeScript code as the final answer.',
    'Do not use bare nth(), global text, global placeholder, long CSS, XPath, or force clicks for critical actions.',
    'The patch must be checkable by deterministic schema/safety validators and segment replay.',
    'Required schema: {"schema":"replay-repair-patch/v1","diagnosis":{"failureKind":"current-step-locator|propagated-missing-step|propagated-wrong-step|propagated-skipped-step|extra-step-state-drift|assertion-obsolete|application-behavior-change|unsafe-repair-rejected","symptomStepId":"string","rootCauseStepId":"string","confidence":0.0,"reason":"string"},"patches":[{"op":"insert-step|unskip-step|replace-recipe|replace-locator|replace-locator-scope|delete-step|add-assertion|update-assertion","stepId":"string","reason":"string"}],"validationPlan":["string"],"risk":{"level":"low|medium|high","unsafePatterns":[],"notes":"string"}}',
    'Repair context:',
    boundedContext,
  ].join('\n');
}
