/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildReplayRepairContext } from '../repair/repairContextBuilder';
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
}];
