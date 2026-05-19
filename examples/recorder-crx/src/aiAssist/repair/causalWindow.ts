/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow, FlowStep } from '../../flow/types';
import type { ReplayRepairFailure } from './types';

export interface ReplayCausalWindow {
  symptomStepId: string;
  rootCauseStepId: string;
  stepIds: string[];
  reason: string;
}

export function buildReplayCausalWindow(flow: BusinessFlow, failure: ReplayRepairFailure): ReplayCausalWindow {
  const symptom = flow.steps.find(step => step.id === failure.symptomStepId);
  if (!symptom) {
    return {
      symptomStepId: failure.symptomStepId,
      rootCauseStepId: failure.symptomStepId,
      stepIds: [failure.symptomStepId],
      reason: 'Symptom step not found in flow.',
    };
  }
  const expectedDialog = expectedBeforeDialogTitle(symptom);
  const actualDialog = actualDialogTitle(failure.actualBefore);
  if (expectedDialog && actualDialog !== expectedDialog) {
    const opener = findDialogOpener(flow, expectedDialog, symptom.order);
    if (opener) {
      return {
        symptomStepId: symptom.id,
        rootCauseStepId: opener.id,
        stepIds: windowStepIds(flow, opener, symptom),
        reason: `${symptom.id} expected dialog ${expectedDialog}, but replay actual state did not have it; ${opener.id} is the closest opener/state transition step.`,
      };
    }
  }
  return {
    symptomStepId: symptom.id,
    rootCauseStepId: symptom.id,
    stepIds: windowStepIds(flow, symptom, symptom),
    reason: 'Expected state is present or no upstream opener explains the failure; treat the failing step locator as the root cause.',
  };
}

function findDialogOpener(flow: BusinessFlow, dialogTitle: string, beforeOrder: number): FlowStep | undefined {
  return [...flow.steps]
      .filter(step => step.order < beforeOrder && step.context?.after?.openedDialog?.title === dialogTitle)
      .sort((a, b) => b.order - a.order)[0];
}

function windowStepIds(flow: BusinessFlow, root: FlowStep, symptom: FlowStep) {
  const from = Math.max(0, flow.steps.findIndex(step => step.id === root.id) - 1);
  const to = Math.min(flow.steps.length - 1, flow.steps.findIndex(step => step.id === symptom.id) + 1);
  return flow.steps.slice(from, to + 1).map(step => step.id);
}

function expectedBeforeDialogTitle(step: FlowStep) {
  return step.context?.before.dialog?.title || step.target?.scope?.dialog?.title;
}

function actualDialogTitle(value: unknown) {
  const state = value as any;
  return state?.dialog?.title || state?.before?.dialog?.title;
}
