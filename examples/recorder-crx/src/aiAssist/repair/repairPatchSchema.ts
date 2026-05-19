/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { parseJsonObject } from '../review/reviewPatchSchema';
import type { ReplayRepairContext, ReplayRepairPatch } from './types';

const failureKinds = new Set(['current-step-locator', 'propagated-missing-step', 'propagated-wrong-step', 'propagated-skipped-step', 'extra-step-state-drift', 'assertion-obsolete', 'application-behavior-change', 'unsafe-repair-rejected']);
const patchOps = new Set(['insert-step', 'unskip-step', 'replace-recipe', 'replace-locator', 'replace-locator-scope', 'delete-step', 'add-assertion', 'update-assertion']);
const riskLevels = new Set(['low', 'medium', 'high']);

export function parseReplayRepairPatch(rawOutput: string, context?: ReplayRepairContext): ReplayRepairPatch {
  const parsed = parseJsonObject(rawOutput);
  const errors = validateReplayRepairPatchShape(parsed, context);
  if (errors.length)
    throw new Error(`Invalid replay-repair-patch/v1: ${errors.join('; ')}`);
  return parsed as ReplayRepairPatch;
}

export function validateReplayRepairPatchShape(value: unknown, context?: ReplayRepairContext): string[] {
  const errors: string[] = [];
  const patch = value as ReplayRepairPatch;
  const stepIds = context ? new Set(context.steps.map(step => step.id)) : undefined;
  if (!patch || typeof patch !== 'object')
    return ['patch must be object'];
  if (patch.schema !== 'replay-repair-patch/v1')
    errors.push('schema must be replay-repair-patch/v1');
  if (!failureKinds.has(patch.diagnosis?.failureKind))
    errors.push('diagnosis.failureKind is invalid');
  if (!knownStep(patch.diagnosis?.symptomStepId, stepIds))
    errors.push(`unknown symptomStepId ${patch.diagnosis?.symptomStepId}`);
  if (!knownStep(patch.diagnosis?.rootCauseStepId, stepIds))
    errors.push(`unknown rootCauseStepId ${patch.diagnosis?.rootCauseStepId}`);
  if (typeof patch.diagnosis?.confidence !== 'number' || patch.diagnosis.confidence < 0 || patch.diagnosis.confidence > 1)
    errors.push('diagnosis.confidence must be 0..1');
  if (typeof patch.diagnosis?.reason !== 'string')
    errors.push('diagnosis.reason is required');
  if (!Array.isArray(patch.patches))
    errors.push('patches must be array');
  for (const op of Array.isArray(patch.patches) ? patch.patches : []) {
    if (!patchOps.has(op?.op))
      errors.push(`unsupported op ${op?.op}`);
    if (!knownStep(op?.stepId, stepIds))
      errors.push(`unknown patch stepId ${op?.stepId}`);
    if (typeof op?.reason !== 'string')
      errors.push(`patch reason missing for ${op?.stepId}`);
  }
  if (!Array.isArray(patch.validationPlan) || !patch.validationPlan.every(item => typeof item === 'string'))
    errors.push('validationPlan must be string[]');
  if (!riskLevels.has(patch.risk?.level))
    errors.push('risk.level is invalid');
  if (!Array.isArray(patch.risk?.unsafePatterns))
    errors.push('risk.unsafePatterns must be array');
  if (/waitForTimeout|await\s+page\.|import\s+\{|test\(["']|=>\s*\{/.test(JSON.stringify(value)))
    errors.push('patch must not contain waitForTimeout or raw TypeScript code');
  return errors;
}

function knownStep(value: unknown, stepIds?: Set<string>) {
  return typeof value === 'string' && (!stepIds || stepIds.has(value));
}
