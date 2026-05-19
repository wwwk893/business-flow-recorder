/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import { generateBusinessFlowPlaybackCode } from '../../replay';
import { applyReplayRepairPatch } from './repairPatchApplier';
import { validateReplayRepairPatchShape } from './repairPatchSchema';
import type { ReplayRepairContext, ReplayRepairPatch, ReplayRepairValidationResult } from './types';

export function validateReplayRepairPatch(flow: BusinessFlow, context: ReplayRepairContext, patch: ReplayRepairPatch): ReplayRepairValidationResult {
  const errors = validateReplayRepairPatchShape(patch, context);
  const warnings: string[] = [];
  if (patch.patches.some(op => /waitForTimeout|await\s+page\.|\.click\(|\.fill\(/.test(JSON.stringify(op))))
    errors.push('AI repair patch cannot contain raw TypeScript replay code.');
  if (patch.risk.unsafePatterns.some(pattern => /getByText|global text|nth|first|last|long css|xpath/i.test(pattern)))
    errors.push('AI repair patch declares unsafe locator patterns.');
  if (context.causalWindow.rootCauseStepId !== patch.diagnosis.rootCauseStepId) {
    if (context.causalWindow.rootCauseStepId !== context.causalWindow.symptomStepId)
      errors.push(`propagated failure root cause should be ${context.causalWindow.rootCauseStepId}, not ${patch.diagnosis.rootCauseStepId}.`);
    else
      warnings.push(`causal window root ${context.causalWindow.rootCauseStepId} differs from AI diagnosis.`);
  }
  if (context.causalWindow.rootCauseStepId !== context.causalWindow.symptomStepId) {
    const rootPatched = patch.patches.some(op => op.stepId === context.causalWindow.rootCauseStepId && (op.op === 'unskip-step' || op.op === 'insert-step' || op.op === 'replace-recipe'));
    if (!rootPatched)
      errors.push('propagated replay failure must patch the root cause step, not only the symptom step.');
  }
  const appliedFlow = errors.length ? undefined : applyReplayRepairPatch(flow, patch);
  if (appliedFlow) {
    const code = generateBusinessFlowPlaybackCode(appliedFlow);
    if (/page\.getByText\(/.test(code) && patch.risk.level === 'high')
      errors.push('patched parser-safe code contains global getByText for high-risk repair.');
    if (/\/html\/body|xpath=/.test(code))
      errors.push('patched parser-safe code contains XPath.');
  }
  return {
    ok: errors.length === 0,
    appliedFlow: errors.length === 0 ? appliedFlow : undefined,
    errors,
    warnings,
    rootCauseStepId: patch.diagnosis.rootCauseStepId,
  };
}
