/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { buildReplayRepairContext } from '../repair/repairContextBuilder';
import { parseReplayRepairPatch } from '../repair/repairPatchSchema';
import { assert, correctLanRepairPatch, createLanPropagatedFlow } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const repairPatchSchemaTests: AiAssistTestCase[] = [{
  name: 'AI Repair patch schema accepts structured patch and rejects raw code',
  run: () => {
    const context = buildReplayRepairContext({ flow: createLanPropagatedFlow(), failure: { symptomStepId: 's009', errorText: 'not found', actualBefore: {} } });
    assert(parseReplayRepairPatch(JSON.stringify(correctLanRepairPatch()), context).diagnosis.rootCauseStepId === 's007', 'repair patch should parse');
    let rejected = false;
    try {
      parseReplayRepairPatch(JSON.stringify({
        ...correctLanRepairPatch(),
        patches: [{ op: 'replace-locator', stepId: 's009', locator: { code: 'await page.getByPlaceholder("x").nth(0).fill("y")' }, reason: 'raw code' }],
      }), context);
    } catch {
      rejected = true;
    }
    assert(rejected, 'raw TypeScript should be rejected');
  },
}];
