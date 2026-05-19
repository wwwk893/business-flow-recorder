/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildReplayRepairContext } from '../repair/repairContextBuilder';
import { applyReplayRepairPatch } from '../repair/repairPatchApplier';
import { validateReplayRepairPatch } from '../repair/repairValidator';
import { assert, correctLanRepairPatch, createLanPropagatedFlow } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const repairValidatorTests: AiAssistTestCase[] = [{
  name: 'AI Repair validator requires propagated patch to repair root cause step',
  run: () => {
    const flow = createLanPropagatedFlow();
    const context = buildReplayRepairContext({ flow, failure: { symptomStepId: 's009', errorText: 'not found', actualBefore: {} } });
    const good = validateReplayRepairPatch(flow, context, correctLanRepairPatch());
    assert(good.ok, `correct repair patch should validate: ${good.errors.join('; ')}`);
    const bad = validateReplayRepairPatch(flow, context, {
      ...correctLanRepairPatch(),
      diagnosis: { ...correctLanRepairPatch().diagnosis, failureKind: 'current-step-locator', rootCauseStepId: 's009' },
      patches: [{ op: 'replace-locator-scope', stepId: 's009', scope: { dialog: { title: '编辑LAN1' } }, reason: 'symptom only' }],
      risk: { level: 'medium', unsafePatterns: [], notes: 'symptom only' },
    });
    assert(!bad.ok, 'symptom-only repair should fail propagated validation');
  },
}, {
  name: 'AI Repair schema rejects missing payloads and applier keeps same-step operations',
  run: () => {
    const flow = createLanPropagatedFlow();
    const context = buildReplayRepairContext({ flow, failure: { symptomStepId: 's009', errorText: 'not found', actualBefore: {} } });
    const missingRecipe = validateReplayRepairPatch(flow, context, {
      ...correctLanRepairPatch(),
      patches: [{ op: 'replace-recipe', stepId: 's007', reason: 'missing recipe' }],
    });
    assert(!missingRecipe.ok, 'replace-recipe without recipe object should be rejected');

    const patch = {
      ...correctLanRepairPatch(),
      patches: [
        { op: 'unskip-step' as const, stepId: 's007', reason: 'unskip edit step' },
        { op: 'replace-recipe' as const, stepId: 's007', recipe: { kind: 'table-row-action', operation: 'edit' }, reason: 'restore edit recipe' },
      ],
    };
    const applied = applyReplayRepairPatch(flow, patch);
    const step = applied.steps.find(item => item.id === 's007');
    assert(step?.artifacts?.aiAssist?.forceEmit, 'unskip-step should still apply when replace-recipe targets same step');
    assert(step?.uiRecipe?.kind === 'table-row-action', 'replace-recipe should also apply on same step');
  },
}];
