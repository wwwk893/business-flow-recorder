/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import type { ReplayRepairFailure } from './types';

export function buildReplayTrace(flow: BusinessFlow, failure: ReplayRepairFailure) {
  const symptom = flow.steps.find(step => step.id === failure.symptomStepId);
  return {
    expectedStates: symptom ? [{
      stepId: symptom.id,
      before: symptom.context?.before,
      after: symptom.context?.after,
    }] : [],
    actualStates: [{
      stepId: failure.symptomStepId,
      before: failure.actualBefore,
      after: failure.actualAfter,
    }],
    stateDiffs: symptom ? stateDiffs(symptom.context?.before, failure.actualBefore, failure.symptomStepId) : [],
  };
}

function stateDiffs(expected: unknown, actual: unknown, stepId: string) {
  const diffs: Array<{ stepId: string; field: string; expected?: unknown; actual?: unknown }> = [];
  const expectedDialog = (expected as any)?.dialog?.title;
  const actualDialog = (actual as any)?.dialog?.title;
  if (expectedDialog && expectedDialog !== actualDialog)
    diffs.push({ stepId, field: 'dialog.title', expected: expectedDialog, actual: actualDialog });
  const expectedForm = (expected as any)?.form?.label;
  const actualForm = (actual as any)?.form?.label;
  if (expectedForm && expectedForm !== actualForm)
    diffs.push({ stepId, field: 'form.label', expected: expectedForm, actual: actualForm });
  return diffs;
}
