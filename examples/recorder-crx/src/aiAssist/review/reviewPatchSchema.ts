/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { RecordingReviewContext, RecordingReviewPatch } from './types';

const issueKinds = new Set([
  'missing-emitted-step',
  'weak-locator',
  'missing-state-transition',
  'propagated-failure-risk',
  'unscoped-table-row-action',
  'unscoped-dialog-field',
  'select-trigger-option-risk',
  'terminal-assertion-risk',
  'false-positive-none',
]);
const severities = new Set(['low', 'medium', 'high', 'critical']);
const risks = severities;
const patchOps = new Set(['force-emit-step', 'replace-recipe', 'replace-locator-scope', 'add-locator-contract-hint', 'mark-needs-human-review']);

export function parseRecordingReviewPatch(rawOutput: string, context?: RecordingReviewContext): RecordingReviewPatch {
  const parsed = parseJsonObject(rawOutput);
  const errors = validateRecordingReviewPatchShape(parsed, context);
  if (errors.length)
    throw new Error(`Invalid recording-review-patch/v1: ${errors.join('; ')}`);
  return parsed as RecordingReviewPatch;
}

export function validateRecordingReviewPatchShape(value: unknown, context?: RecordingReviewContext): string[] {
  const errors: string[] = [];
  const patch = value as RecordingReviewPatch;
  const stepIds = context ? new Set(context.steps.map(step => step.id)) : undefined;
  if (!patch || typeof patch !== 'object')
    return ['patch must be an object'];
  if (patch.schema !== 'recording-review-patch/v1')
    errors.push('schema must be recording-review-patch/v1');
  if (!patch.diagnosis || typeof patch.diagnosis.summary !== 'string')
    errors.push('diagnosis.summary is required');
  if (!risks.has(patch.diagnosis?.overallRisk))
    errors.push('diagnosis.overallRisk is invalid');
  if (typeof patch.diagnosis?.issueCount !== 'number')
    errors.push('diagnosis.issueCount is required');
  if (!Array.isArray(patch.issues))
    errors.push('issues must be an array');
  for (const issue of Array.isArray(patch.issues) ? patch.issues : []) {
    if (!issueKinds.has(issue?.issueKind))
      errors.push(`issueKind invalid for ${issue?.issueId || 'issue'}`);
    if (!severities.has(issue?.severity))
      errors.push(`severity invalid for ${issue?.issueId || 'issue'}`);
    if (!isKnownStep(issue?.rootCauseStepId, stepIds))
      errors.push(`unknown rootCauseStepId ${issue?.rootCauseStepId}`);
    if (!Array.isArray(issue?.affectedStepIds) || !issue.affectedStepIds.every((stepId: unknown) => isKnownStep(stepId, stepIds)))
      errors.push(`affectedStepIds invalid for ${issue?.issueId || 'issue'}`);
    if (!Array.isArray(issue?.evidence))
      errors.push(`evidence must be array for ${issue?.issueId || 'issue'}`);
  }
  if (!Array.isArray(patch.patches))
    errors.push('patches must be an array');
  for (const op of Array.isArray(patch.patches) ? patch.patches : []) {
    if (!patchOps.has(op?.op))
      errors.push(`unsupported patch op ${op?.op}`);
    if (!isKnownStep(op?.stepId, stepIds))
      errors.push(`unknown patch stepId ${op?.stepId}`);
    if (typeof op?.reason !== 'string')
      errors.push(`patch reason missing for ${op?.stepId}`);
    if (op?.op === 'replace-recipe' && (!op.recipe || typeof op.recipe !== 'object'))
      errors.push(`replace-recipe requires structured recipe for ${op.stepId}`);
    if (op?.op === 'replace-locator-scope' && (!op.scope || typeof op.scope !== 'object'))
      errors.push(`replace-locator-scope requires structured scope for ${op.stepId}`);
  }
  if (!Array.isArray(patch.validationPlan) || !patch.validationPlan.every(item => typeof item === 'string'))
    errors.push('validationPlan must be string[]');
  if (!patch.autoApplyEligibility || typeof patch.autoApplyEligibility.eligible !== 'boolean')
    errors.push('autoApplyEligibility.eligible is required');
  if (!risks.has(patch.autoApplyEligibility?.maxRisk))
    errors.push('autoApplyEligibility.maxRisk is invalid');
  if (patch.patches?.length && patch.issues?.every(issue => issue.issueKind === 'false-positive-none'))
    errors.push('patches are not reasonable for false-positive-none only');
  return errors;
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (trimmed.startsWith('{'))
    return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match)
    throw new Error('AI output did not contain a JSON object.');
  return JSON.parse(match[0]);
}

function isKnownStep(value: unknown, stepIds?: Set<string>) {
  return typeof value === 'string' && (!stepIds || stepIds.has(value));
}
