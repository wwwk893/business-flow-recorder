/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow, FlowStep } from '../../flow/types';
import type { RecordingReviewPatch, RecordingReviewPatchOperation } from './types';

export function applyRecordingReviewPatch(flow: BusinessFlow, patch: RecordingReviewPatch): BusinessFlow {
  const byStepId = groupPatchOpsByStep(patch.patches);
  let changed = false;
  const steps = flow.steps.map(step => {
    const ops = byStepId.get(step.id);
    if (!ops?.length)
      return step;
    changed = true;
    return ops.reduce(applyOperationToStep, step);
  });
  if (!changed)
    return flow;
  return {
    ...flow,
    steps,
    artifacts: {
      ...flow.artifacts,
      aiAssist: {
        ...(flow.artifacts as any)?.aiAssist,
        lastReviewPatch: {
          appliedAt: new Date().toISOString(),
          summary: patch.diagnosis.summary,
          issueCount: patch.diagnosis.issueCount,
        },
      },
    } as any,
    updatedAt: new Date().toISOString(),
  };
}

function groupPatchOpsByStep(ops: RecordingReviewPatchOperation[]) {
  const grouped = new Map<string, RecordingReviewPatchOperation[]>();
  for (const op of ops) {
    const list = grouped.get(op.stepId) || [];
    list.push(op);
    grouped.set(op.stepId, list);
  }
  return grouped;
}

function applyOperationToStep(step: FlowStep, op: RecordingReviewPatchOperation): FlowStep {
  const previousIds = step.artifacts?.aiAssist?.lastPatchIds || [];
  const previousReasons = step.artifacts?.aiAssist?.lastPatchReasons || [];
  const aiAssist = {
    ...step.artifacts?.aiAssist,
    lastPatchId: op.op,
    lastPatchReason: op.reason,
    lastPatchIds: [...previousIds, op.op],
    lastPatchReasons: [...previousReasons, op.reason],
  };
  if (op.op === 'force-emit-step')
    aiAssist.forceEmit = true;
  if (op.op === 'add-locator-contract-hint')
    aiAssist.locatorContractHint = op.locatorContractHint;
  if (op.op === 'mark-needs-human-review')
    aiAssist.needsHumanReview = true;

  return {
    ...step,
    uiRecipe: op.op === 'replace-recipe' ? op.recipe as any : step.uiRecipe,
    target: op.op === 'replace-locator-scope' ? {
      ...step.target,
      scope: {
        ...step.target?.scope,
        ...(op.scope as any),
      },
    } : step.target,
    artifacts: {
      ...step.artifacts,
      aiAssist,
    },
  };
}
