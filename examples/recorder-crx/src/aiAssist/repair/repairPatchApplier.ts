/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow, FlowStep } from '../../flow/types';
import type { ReplayRepairPatch, ReplayRepairPatchOperation } from './types';

export function applyReplayRepairPatch(flow: BusinessFlow, patch: ReplayRepairPatch): BusinessFlow {
  const opsByStepId = groupPatchOpsByStep(patch.patches.filter(op => op.op !== 'insert-step'));
  const insertOps = patch.patches.filter(op => op.op === 'insert-step');
  let changed = false;
  const steps = flow.steps.map(step => {
    const ops = opsByStepId.get(step.id);
    if (!ops?.length)
      return step;
    changed = true;
    return ops.reduce(applyOperation, step);
  }).filter(step => !(opsByStepId.get(step.id) || []).some(op => op.op === 'delete-step'));
  const insertedSteps = insertSteps(steps, insertOps);
  changed = changed || insertedSteps !== steps;
  if (!changed)
    return flow;
  return {
    ...flow,
    steps: insertedSteps.map((step, index) => ({ ...step, order: index + 1 })),
    updatedAt: new Date().toISOString(),
  };
}

function groupPatchOpsByStep(ops: ReplayRepairPatchOperation[]) {
  const grouped = new Map<string, ReplayRepairPatchOperation[]>();
  for (const op of ops) {
    const stepId = op.stepId;
    if (!stepId)
      continue;
    const list = grouped.get(stepId) || [];
    list.push(op);
    grouped.set(stepId, list);
  }
  return grouped;
}

function insertSteps(steps: FlowStep[], ops: ReplayRepairPatchOperation[]) {
  if (!ops.length)
    return steps;
  let next = [...steps];
  for (const op of ops) {
    if (op.op !== 'insert-step')
      continue;
    const step = normalizeInsertedStep(op, next.length + 1);
    const beforeIndex = op.insertBeforeStepId ? next.findIndex(existing => existing.id === op.insertBeforeStepId) : -1;
    if (beforeIndex >= 0) {
      next.splice(beforeIndex, 0, step);
      continue;
    }
    const afterIndex = op.insertAfterStepId ? next.findIndex(existing => existing.id === op.insertAfterStepId) : -1;
    if (afterIndex >= 0) {
      next.splice(afterIndex + 1, 0, step);
      continue;
    }
    next.push(step);
  }
  return next;
}

function normalizeInsertedStep(op: Extract<ReplayRepairPatchOperation, { op: 'insert-step' }>, fallbackOrder: number): FlowStep {
  const partial = op.step || {};
  return {
    id: partial.id || op.stepId || `ai-repair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    order: typeof partial.order === 'number' ? partial.order : fallbackOrder,
    kind: partial.kind || 'manual',
    action: partial.action || 'click',
    intent: partial.intent,
    comment: partial.comment || op.reason,
    uiRecipe: partial.uiRecipe,
    context: partial.context,
    target: partial.target,
    value: partial.value,
    assertions: partial.assertions || [],
    rawAction: partial.rawAction,
    sourceCode: partial.sourceCode,
    artifacts: {
      ...partial.artifacts,
      aiAssist: {
        ...partial.artifacts?.aiAssist,
        forceEmit: true,
        lastPatchId: op.op,
        lastPatchReason: op.reason,
        lastPatchIds: [...(partial.artifacts?.aiAssist?.lastPatchIds || []), op.op],
        lastPatchReasons: [...(partial.artifacts?.aiAssist?.lastPatchReasons || []), op.reason],
      },
    },
  };
}

function applyOperation(step: FlowStep, op: ReplayRepairPatchOperation): FlowStep {
  const previousIds = step.artifacts?.aiAssist?.lastPatchIds || [];
  const previousReasons = step.artifacts?.aiAssist?.lastPatchReasons || [];
  const aiAssist = {
    ...step.artifacts?.aiAssist,
    lastPatchId: op.op,
    lastPatchReason: op.reason,
    lastPatchIds: [...previousIds, op.op],
    lastPatchReasons: [...previousReasons, op.reason],
  };
  if (op.op === 'unskip-step')
    aiAssist.forceEmit = true;
  return {
    ...step,
    uiRecipe: op.op === 'replace-recipe' ? op.recipe as any : step.uiRecipe,
    target: op.op === 'replace-locator-scope' || op.op === 'replace-locator' ? {
      ...step.target,
      ...(op.op === 'replace-locator' ? op.locator as any : {}),
      scope: op.op === 'replace-locator-scope' ? {
        ...step.target?.scope,
        ...(op.scope as any),
      } : step.target?.scope,
    } : step.target,
    assertions: op.op === 'add-assertion' ? [...step.assertions, op.assertion as any] : step.assertions,
    artifacts: {
      ...step.artifacts,
      aiAssist,
    },
  };
}
