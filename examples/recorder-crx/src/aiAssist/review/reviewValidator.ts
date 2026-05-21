/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import { buildLocatorContract, generateBusinessFlowPlaybackCode } from '../../replay';
import { applyRecordingReviewPatch } from './reviewPatchApplier';
import { validateRecordingReviewPatchShape } from './reviewPatchSchema';
import type { RecordingReviewContext, RecordingReviewPatch, RecordingReviewValidationResult } from './types';

export function validateRecordingReviewPatch(flow: BusinessFlow, context: RecordingReviewContext, patch: RecordingReviewPatch): RecordingReviewValidationResult {
  const errors = validateRecordingReviewPatchShape(patch, context);
  const warnings: string[] = [];
  if (patch.patches.some(op => (op as { op?: string }).op === 'delete-step'))
    errors.push('AI review patch cannot delete steps.');
  if (patch.patches.some(op => /waitForTimeout/i.test(JSON.stringify(op))))
    errors.push('AI review patch cannot use waitForTimeout.');
  if (patch.patches.some(op => /await\s+page\.|\.click\(|\.fill\(/.test(JSON.stringify(op))))
    errors.push('AI review patch cannot contain raw TypeScript replay code.');
  if (patch.diagnosis.overallRisk === 'high' || patch.diagnosis.overallRisk === 'critical') {
    if (patch.autoApplyEligibility.eligible)
      errors.push('High/critical recording review patches are not auto-applicable.');
  }
  errors.push(...locatorScopeLabelValidationErrors(context, patch));
  const propagatedErrors = propagatedValidationErrors(context, patch);
  errors.push(...propagatedErrors);

  const appliedFlow = errors.length ? undefined : applyRecordingReviewPatch(flow, patch);
  if (appliedFlow) {
    const parserSafeCode = generateBusinessFlowPlaybackCode(appliedFlow);
    errors.push(...forbiddenGeneratedSourceErrors(context, parserSafeCode));
    errors.push(...forceEmitValidationErrors(context, parserSafeCode, patch));
    for (const op of patch.patches.filter(op => op.op === 'replace-recipe')) {
      const step = appliedFlow.steps.find(candidate => candidate.id === op.stepId);
      const contract = step?.uiRecipe ? buildLocatorContract(step.uiRecipe as any, step) : undefined;
      if (!contract?.primaryExecutable)
        warnings.push(`${op.stepId} replace-recipe did not produce a primaryExecutable locator contract.`);
    }
  }

  return {
    ok: errors.length === 0,
    autoApply: errors.length === 0 && patch.autoApplyEligibility.eligible && patch.diagnosis.overallRisk === 'low',
    appliedFlow: errors.length === 0 ? appliedFlow : undefined,
    errors,
    warnings,
  };
}

export function applyAndValidateRecordingReviewPatch(flow: BusinessFlow, context: RecordingReviewContext, patch: RecordingReviewPatch): RecordingReviewValidationResult {
  return validateRecordingReviewPatch(flow, context, patch);
}

function locatorScopeLabelValidationErrors(context: RecordingReviewContext, patch: RecordingReviewPatch) {
  const errors: string[] = [];
  for (const op of patch.patches) {
    const step = context.steps.find(candidate => candidate.id === op.stepId);
    const stepEvidence = JSON.stringify(step || {});
    for (const label of locatorScopeLabels(op)) {
      if (isPlaceholderScopeLabel(label)) {
        errors.push(`${op.stepId} patch uses placeholder locator label "${label}".`);
        continue;
      }
      if (label && stepEvidence && !stepEvidence.includes(label))
        errors.push(`${op.stepId} patch uses locator label "${label}" that is not present in the review context.`);
    }
  }
  return errors;
}

function locatorScopeLabels(op: RecordingReviewPatch['patches'][number]) {
  const labels: string[] = [];
  const scopeLabel = (op as any).scope?.form?.label;
  const triggerLabel = (op as any).locatorContractHint?.trigger?.form?.label;
  if (typeof scopeLabel === 'string')
    labels.push(scopeLabel);
  if (typeof triggerLabel === 'string')
    labels.push(triggerLabel);
  return labels.filter(Boolean);
}

function isPlaceholderScopeLabel(label: string) {
  return /对应字段标签|字段标签|待补充|待确认|todo|placeholder|field label/i.test(label);
}

function propagatedValidationErrors(context: RecordingReviewContext, patch: RecordingReviewPatch) {
  const errors: string[] = [];
  const propagatedSignals = context.reviewSignals.filter(signal => signal.kind === 'downstream-state-dependency' && (signal.severity === 'high' || signal.severity === 'critical'));
  for (const signal of propagatedSignals) {
    const related = signal.relatedStepIds ?? [];
    const issue = patch.issues.find(candidate => candidate.rootCauseStepId === signal.stepId && candidate.affectedStepIds.some(stepId => related.includes(stepId)));
    const rootPatch = patch.patches.find(op => op.stepId === signal.stepId && (op.op === 'force-emit-step' || op.op === 'replace-recipe'));
    const affectedScopePatch = patch.patches.find(op => related.includes(op.stepId) && op.op === 'replace-locator-scope');
    if (!issue || !rootPatch)
      errors.push(`propagated review risk ${signal.stepId}->${related.join(',')} must patch the root cause step, not only the affected step.`);
    if (!affectedScopePatch)
      errors.push(`propagated review risk ${signal.stepId}->${related.join(',')} must include affected locator scope validation.`);
    if (!patch.validationPlan.some(line => line.includes(signal.stepId) && related.some(stepId => line.includes(stepId))))
      errors.push(`validationPlan must mention the root-to-affected window ${signal.stepId}->${related.join(',')}.`);
  }
  return errors;
}

function forceEmitValidationErrors(context: RecordingReviewContext, parserSafeCode: string, patch: RecordingReviewPatch) {
  const errors: string[] = [];
  for (const op of patch.patches.filter(op => op.op === 'force-emit-step')) {
    const marker = `// ${op.stepId} `;
    const block = parserSafeCode.slice(parserSafeCode.indexOf(marker), parserSafeCode.indexOf(marker) >= 0 ? parserSafeCode.indexOf(marker) + 800 : 0);
    if (!block || /has no runnable Playwright action source|skipped unsafe/.test(block))
      errors.push(`${op.stepId} force-emit-step did not produce runnable parser-safe code.`);
  }
  return errors;
}

function forbiddenGeneratedSourceErrors(context: RecordingReviewContext, parserSafeCode: string) {
  const errors: string[] = [];
  if (/\/html\/body|xpath=/.test(parserSafeCode))
    errors.push('patched parser-safe code contains XPath.');
  if (/page\.getByText\(/.test(parserSafeCode) && context.reviewSignals.some(signal => signal.kind === 'unscoped-table-row-action' || signal.kind === 'safety-preflight-blocked'))
    errors.push('patched parser-safe code contains global getByText for critical action.');
  if (/page\.getByPlaceholder\(/.test(parserSafeCode) && context.reviewSignals.some(signal => signal.kind === 'global-placeholder' && signal.severity === 'high'))
    errors.push('patched parser-safe code still contains high-risk global placeholder.');
  return errors;
}
