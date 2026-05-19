/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow, FlowStep } from '../../flow/types';
import { locatorBlacklistRisks } from '../../replay';
import type { EmittedCodeMapEntry, RecordingReviewSignal } from './types';

export function buildRecordingReviewSignals(flow: BusinessFlow, emittedCodeMap: Record<string, EmittedCodeMapEntry>): RecordingReviewSignal[] {
  const signals: RecordingReviewSignal[] = [];
  for (const step of flow.steps) {
    const emitted = emittedCodeMap[step.id];
    const generatedCode = `${emitted?.exportedCode || ''}\n${emitted?.parserSafeCode || ''}`;
    signals.push(...notEmittedSignals(step, flow, emitted));
    signals.push(...missingStateTransitionSignals(step, generatedCode));
    signals.push(...unscopedTableRowSignals(step, generatedCode));
    signals.push(...globalPlaceholderSignals(step, generatedCode));
    signals.push(...selectTriggerOptionSignals(step, generatedCode));
    signals.push(...duplicateTestIdSignals(step, generatedCode));
    signals.push(...safetyPreflightSignals(step, generatedCode));
  }
  signals.push(...downstreamStateDependencySignals(flow, emittedCodeMap));
  return dedupeSignals(signals);
}

function notEmittedSignals(step: FlowStep, flow: BusinessFlow, emitted?: EmittedCodeMapEntry): RecordingReviewSignal[] {
  if (!isActionStep(step) || emitted?.emitted !== false)
    return [];
  const dependents = dependentDialogStepIds(flow, step);
  const severity = dependents.length ? 'critical' : 'high';
  return [{
    stepId: step.id,
    severity,
    kind: 'not-emitted',
    message: dependents.length ?
      `${step.id} 未生成可执行代码，但后续步骤依赖它打开的弹窗/状态。` :
      `${step.id} 未生成可执行代码。`,
    evidence: { skipReason: emitted?.skipReason, after: step.context?.after },
    relatedStepIds: dependents,
  }];
}

function missingStateTransitionSignals(step: FlowStep, generatedCode: string): RecordingReviewSignal[] {
  const openedDialog = step.context?.after?.openedDialog;
  if (!openedDialog?.title)
    return [];
  if (generatedCode && !isNoRunnableCode(generatedCode))
    return [];
  return [{
    stepId: step.id,
    severity: 'high',
    kind: 'missing-state-transition',
    message: `${step.id} 记录到打开 ${openedDialog.title}，但生成代码没有保留对应 opener。`,
    evidence: { openedDialog },
  }];
}

function downstreamStateDependencySignals(flow: BusinessFlow, emittedCodeMap: Record<string, EmittedCodeMapEntry>): RecordingReviewSignal[] {
  const signals: RecordingReviewSignal[] = [];
  for (const opener of flow.steps) {
    const openedDialog = opener.context?.after?.openedDialog;
    if (!openedDialog?.title)
      continue;
    const dependentIds = dependentDialogStepIds(flow, opener);
    if (!dependentIds.length)
      continue;
    const emitted = emittedCodeMap[opener.id];
    const weak = emitted?.emitted === false || isWeakLocatorSource(`${emitted?.exportedCode || ''}\n${emitted?.parserSafeCode || ''}`);
    if (!weak)
      continue;
    signals.push({
      stepId: opener.id,
      severity: emitted?.emitted === false ? 'critical' : 'high',
      kind: 'downstream-state-dependency',
      message: `${dependentIds.join(', ')} 依赖 ${opener.id} 打开的 ${openedDialog.title}；前置步骤缺失或 locator 较弱会传播成后续失败。`,
      evidence: { openedDialog, emitted },
      relatedStepIds: dependentIds,
    });
  }
  return signals;
}

function unscopedTableRowSignals(step: FlowStep, generatedCode: string): RecordingReviewSignal[] {
  const rowKey = step.target?.scope?.table?.rowKey || step.context?.before.table?.rowKey || step.uiRecipe?.rowKey;
  const isRowAction = step.uiRecipe?.kind === 'table-row-action' || step.uiRecipe?.operation === 'rowAction' || !!rowKey;
  if (!isRowAction)
    return [];
  if (rowKey && /data-row-key|getByTestId\(["'][^"']+["']\).*data-row-key/.test(generatedCode))
    return [];
  if (rowKey && /getByRole|getByText|locator\(["']div/.test(generatedCode)) {
    return [{
      stepId: step.id,
      severity: 'high',
      kind: 'unscoped-table-row-action',
      message: `${step.id} 是表格行操作，但生成代码没有稳定使用 rowKey/table scope。`,
      evidence: { rowKey, generatedCode: snippet(generatedCode) },
    }];
  }
  return [];
}

function globalPlaceholderSignals(step: FlowStep, generatedCode: string): RecordingReviewSignal[] {
  if (step.action !== 'fill' || !/page\.getByPlaceholder\(/.test(generatedCode))
    return [];
  const hasScope = !!(step.target?.scope?.dialog?.title || step.context?.before.dialog?.title || step.context?.before.form?.label || step.target?.scope?.form?.label || step.context?.before.table?.rowKey);
  const duplicate = (step.target?.locatorHint?.pageCount ?? step.context?.before.target?.uniqueness?.pageCount ?? 0) > 1;
  if (!hasScope && !duplicate)
    return [];
  return [{
    stepId: step.id,
    severity: duplicate || step.context?.before.dialog?.title ? 'high' : 'medium',
    kind: 'global-placeholder',
    message: `${step.id} 使用全局 placeholder fill，但录制上下文存在更强 dialog/form/table scope。`,
    evidence: { placeholder: step.target?.placeholder || step.context?.before.target?.placeholder, generatedCode: snippet(generatedCode), pageCount: step.target?.locatorHint?.pageCount ?? step.context?.before.target?.uniqueness?.pageCount },
  }];
}

function selectTriggerOptionSignals(step: FlowStep, generatedCode: string): RecordingReviewSignal[] {
  const controlType = step.context?.before.target?.controlType || '';
  const optionLike = /(select-option|tree-select-option|cascader-option)/.test(controlType) || step.target?.role === 'option';
  if (!optionLike)
    return [];
  const scoped = /ant-select-dropdown:not|activePopupOption|active-antd-popup|aria-controls|aria-owns|runtime/.test(generatedCode);
  if (scoped)
    return [];
  return [{
    stepId: step.id,
    severity: 'medium',
    kind: 'select-trigger-option-mismatch',
    message: `${step.id} 是 AntD/ProComponents option，但生成代码只依赖全局 option 文本。`,
    evidence: { controlType, generatedCode: snippet(generatedCode) },
  }];
}

function duplicateTestIdSignals(step: FlowStep, generatedCode: string): RecordingReviewSignal[] {
  const testId = step.target?.testId || step.context?.before.target?.testId;
  const pageCount = step.target?.locatorHint?.pageCount ?? step.context?.before.target?.uniqueness?.pageCount;
  if (!testId || !pageCount || pageCount <= 1)
    return [];
  const globalTestId = new RegExp(`page\\.getByTestId\\(["']${escapeRegExp(testId)}["']\\)`).test(generatedCode);
  const scoped = /locator\(|getByRole\(|data-row-key|filter\(\{\s*hasText/.test(generatedCode.replace(new RegExp(`page\\.getByTestId\\(["']${escapeRegExp(testId)}["']\\)`, 'g'), ''));
  if (!globalTestId || scoped)
    return [];
  return [{
    stepId: step.id,
    severity: 'high',
    kind: 'duplicate-testid',
    message: `${step.id} 的 testId 在页面中重复，但生成代码使用全局 getByTestId。`,
    evidence: { testId, pageCount, generatedCode: snippet(generatedCode) },
  }];
}

function safetyPreflightSignals(step: FlowStep, generatedCode: string): RecordingReviewSignal[] {
  const risks = locatorBlacklistRisks(generatedCode).filter(risk => risk.severity === 'critical' || risk.severity === 'high');
  if (!risks.length)
    return [];
  return [{
    stepId: step.id,
    severity: risks.some(risk => risk.severity === 'critical') ? 'critical' : 'high',
    kind: 'safety-preflight-blocked',
    message: `${step.id} 的生成 locator 命中 replay safety 风险。`,
    evidence: risks,
  }];
}

function dependentDialogStepIds(flow: BusinessFlow, opener: FlowStep) {
  const opened = opener.context?.after?.openedDialog;
  if (!opened?.title)
    return [];
  return flow.steps
      .filter(step => step.order > opener.order && step.context?.before.dialog?.title === opened.title)
      .map(step => step.id);
}

function isActionStep(step: FlowStep) {
  return step.action === 'click' || step.action === 'fill' || step.action === 'select' || step.action === 'check' || step.action === 'uncheck' || step.action === 'press';
}

function isNoRunnableCode(code: string) {
  return /has no runnable Playwright action source|skipped unsafe/.test(code) || !/\bawait\s+page|\bawait\s+[^;]+\.(?:click|fill|selectOption|press|check|uncheck)\(/.test(code);
}

function isWeakLocatorSource(code: string) {
  return /page\.getByText\(|page\.getByPlaceholder\(|\.nth\(|locator\(["']div["']\)/.test(code);
}

function dedupeSignals(signals: RecordingReviewSignal[]) {
  const seen = new Set<string>();
  return signals.filter(signal => {
    const key = `${signal.stepId}:${signal.kind}:${signal.message}`;
    if (seen.has(key))
      return false;
    seen.add(key);
    return true;
  });
}

function snippet(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 280);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
