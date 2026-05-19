/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow, FlowStep } from '../../flow/types';
import { createEmptyBusinessFlow } from '../../flow/types';
import type { EmittedCodeMapEntry, RecordingReviewPatch } from '../review/types';
import type { ReplayRepairPatch } from '../repair/types';

export type AiAssistTestCase = {
  name: string;
  run: () => void | Promise<void>;
};

export function assert(value: unknown, message: string): asserts value {
  if (!value)
    throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message?: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson)
    throw new Error(message || `Expected ${expectedJson}, received ${actualJson}`);
}

export function createLanPropagatedFlow(): BusinessFlow {
  return createEmptyBusinessFlow({
    flow: { id: 'flow-lan-review', name: 'LAN review propagated risk' },
    steps: [
      clickStep('s001', 1, '新建', {
        target: { testId: 'lan-device-section' },
        after: { openedDialog: { type: 'modal', title: '新建LAN定义', visible: true } },
      }),
      clickStep('s006', 2, '确定', {
        before: { dialog: { type: 'modal', title: '新建LAN定义', visible: true } },
      }),
      {
        ...clickStep('s007', 3, 'LAN1 DHCP类型：关闭添加描述', {
          target: {
            text: 'LAN1 DHCP类型：关闭添加描述',
            scope: {
              table: {
                testId: 'lan-device-table',
                rowKey: 'LAN1',
                rowText: 'LAN1 DHCP类型：关闭 添加描述',
              },
            },
          },
          before: {
            table: {
              testId: 'lan-device-table',
              rowKey: 'LAN1',
              rowText: 'LAN1 DHCP类型：关闭 添加描述',
            },
          },
          after: { openedDialog: { type: 'modal', title: '编辑LAN1', visible: true, testId: 'lan-edit-modal' } },
          sourceCode: 'await page.getByTestId("lan-device-table").locator("[data-row-key=\\"LAN1\\"]").getByRole("button", { name: "编辑" }).click();',
        }),
        uiRecipe: {
          kind: 'table-row-action',
          library: 'pro-components',
          component: 'TableRowAction',
          operation: 'rowAction',
          rowKey: 'LAN1',
          targetText: '编辑',
        },
      } as FlowStep,
      {
        ...fillStep('s009', 4, '192.168.1.1/24', {
          target: { placeholder: '例如：192.168.1.1/24' },
          before: {
            dialog: { type: 'modal', title: '编辑LAN1', visible: true, testId: 'lan-edit-modal' },
            form: { label: 'LAN IP', name: 'prefixAndGateway' },
            target: { role: 'textbox', placeholder: '例如：192.168.1.1/24', uniqueness: { pageCount: 2, pageIndex: 1 } },
          },
          sourceCode: 'await page.getByPlaceholder("例如：192.168.1.1/24").fill("192.168.1.1/24");',
        }),
      },
    ],
  });
}

export function lanReviewEmittedMap(): Record<string, EmittedCodeMapEntry> {
  return {
    s001: { stepId: 's001', emitted: true, parserSafeCode: '// s001 点击\nawait page.getByRole("button", { name: "新建" }).click();' },
    s006: { stepId: 's006', emitted: true, parserSafeCode: '// s006 点击\nawait page.getByRole("button", { name: /^(确定|确\\s*定)$/ }).click();' },
    s007: { stepId: 's007', emitted: false, parserSafeCode: '// s007 has no runnable Playwright action source.', skipReason: 'no-runnable-source' },
    s009: { stepId: 's009', emitted: true, parserSafeCode: '// s009 填写\nawait page.getByPlaceholder("例如：192.168.1.1/24").fill("192.168.1.1/24");', risks: ['global-placeholder'] },
  };
}

export function correctLanReviewPatch(): RecordingReviewPatch {
  return {
    schema: 'recording-review-patch/v1',
    diagnosis: {
      overallRisk: 'high',
      summary: 's007 row edit is not emitted, so s009 may run without 编辑LAN1.',
      issueCount: 1,
    },
    issues: [{
      issueId: 'issue-lan-s007-s009',
      issueKind: 'propagated-failure-risk',
      severity: 'high',
      rootCauseStepId: 's007',
      affectedStepIds: ['s009'],
      reason: 's009 depends on the 编辑LAN1 dialog opened by s007.',
      evidence: ['s007 not emitted', 's009 before.dialog=编辑LAN1'],
    }],
    patches: [
      { op: 'force-emit-step', stepId: 's007', reason: 'The LAN1 edit action is required before filling LAN IP.' },
      { op: 'replace-locator-scope', stepId: 's009', scope: { dialog: { title: '编辑LAN1', type: 'modal', visible: true }, form: { label: 'LAN IP' } }, reason: 'Scope the IP fill to the edit dialog/form.' },
    ],
    validationPlan: ['Validate s007->s009 causal window and rerender parser-safe code.', 'Run L1 review propagated risk test.', 'Run segment replay from s007 through s009.'],
    autoApplyEligibility: { eligible: false, reason: 'High risk propagated repair requires user confirmation.', maxRisk: 'high' },
  };
}

export function placeholderOnlyReviewPatch(): RecordingReviewPatch {
  return {
    ...correctLanReviewPatch(),
    diagnosis: { overallRisk: 'medium', summary: 'Only scope s009 placeholder.', issueCount: 1 },
    issues: [{
      issueId: 'issue-placeholder-only',
      issueKind: 'unscoped-dialog-field',
      severity: 'medium',
      rootCauseStepId: 's009',
      affectedStepIds: ['s009'],
      reason: 'Placeholder is broad.',
      evidence: ['global placeholder'],
    }],
    patches: [{ op: 'replace-locator-scope', stepId: 's009', scope: { dialog: { title: '编辑LAN1' } }, reason: 'Scope placeholder.' }],
    validationPlan: ['Validate s009 only.'],
    autoApplyEligibility: { eligible: true, reason: 'Looks low risk.', maxRisk: 'medium' },
  };
}

export function correctLanRepairPatch(): ReplayRepairPatch {
  return {
    schema: 'replay-repair-patch/v1',
    diagnosis: {
      failureKind: 'propagated-skipped-step',
      symptomStepId: 's009',
      rootCauseStepId: 's007',
      confidence: 0.92,
      reason: 's009 expected 编辑LAN1, but s007 row edit was skipped.',
    },
    patches: [
      { op: 'unskip-step', stepId: 's007', reason: 'The edit row action opens 编辑LAN1.' },
      { op: 'replace-locator-scope', stepId: 's009', scope: { dialog: { title: '编辑LAN1' }, form: { label: 'LAN IP' } }, reason: 'Keep the fill inside the edit dialog.' },
    ],
    validationPlan: ['Validate s007->s009 causal window.', 'Rerender parser-safe code.', 'Retry replay from s007.'],
    risk: { level: 'medium', unsafePatterns: [], notes: 'Uses recorded table row context.' },
  };
}

function clickStep(id: string, order: number, text: string, options: any = {}): FlowStep {
  return {
    id,
    order,
    kind: 'recorded',
    action: 'click',
    target: { text, name: text, ...options.target },
    context: {
      eventId: `${id}-event`,
      capturedAt: order,
      before: { target: { text, controlType: 'button' }, ...options.before },
      after: options.after,
    },
    assertions: [],
    sourceCode: options.sourceCode,
  };
}

function fillStep(id: string, order: number, value: string, options: any = {}): FlowStep {
  return {
    id,
    order,
    kind: 'recorded',
    action: 'fill',
    value,
    target: options.target,
    context: {
      eventId: `${id}-event`,
      capturedAt: order,
      before: options.before,
      after: options.after,
    },
    assertions: [],
    sourceCode: options.sourceCode,
  };
}
