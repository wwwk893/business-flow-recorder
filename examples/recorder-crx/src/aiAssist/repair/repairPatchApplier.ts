/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow, FlowStep } from '../../flow/types';
import type { ReplayRepairPatch, ReplayRepairPatchOperation } from './types';

export function applyReplayRepairPatch(flow: BusinessFlow, patch: ReplayRepairPatch): BusinessFlow {
  const byStepId = new Map(patch.patches.map(op => [op.stepId, op]));
  let changed = false;
  const steps = flow.steps.map(step => {
    const op = byStepId.get(step.id);
    if (!op)
      return step;
    changed = true;
    return applyOperation(step, op);
  }).filter(step => !byStepId.get(step.id) || byStepId.get(step.id)?.op !== 'delete-step');
  if (!changed)
    return flow;
  return {
    ...flow,
    steps,
    updatedAt: new Date().toISOString(),
  };
}

function applyOperation(step: FlowStep, op: ReplayRepairPatchOperation): FlowStep {
  const aiAssist = {
    ...step.artifacts?.aiAssist,
    lastPatchId: op.op,
    lastPatchReason: op.reason,
  };
  if (op.op === 'unskip-step')
    aiAssist.forceEmit = true;
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
