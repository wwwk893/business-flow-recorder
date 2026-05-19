/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { toCompactFlow } from '../../flow/compactExporter';
import type { BusinessFlow, FlowStep } from '../../flow/types';
import { buildLocatorContract, countBusinessFlowPlaybackActions, generateBusinessFlowPlaybackCode, generateBusinessFlowPlaywrightCode } from '../../replay';
import { redactAiAssistContext } from '../redactor';
import { buildRecordingReviewSignals } from './reviewSignals';
import type { EmittedCodeMapEntry, LocatorReviewDiagnostic, RecordingReviewContext, RecordingReviewMode, RecordingReviewStep, RecordingStateSignature, RecordingStateTransition } from './types';

export interface BuildRecordingReviewContextOptions {
  reviewMode?: RecordingReviewMode;
  exportedCode?: string;
  parserSafeCode?: string;
  compactFlow?: string;
  emittedCodeMap?: Record<string, EmittedCodeMapEntry>;
  generatedAt?: string;
  maxCodeCharsPerStep?: number;
}

export function buildRecordingReviewContext(flow: BusinessFlow, options: BuildRecordingReviewContextOptions = {}): RecordingReviewContext {
  const exportedCode = options.exportedCode ?? generateBusinessFlowPlaywrightCode(flow);
  const parserSafeCode = options.parserSafeCode ?? generateBusinessFlowPlaybackCode(flow);
  const emittedCodeMap = options.emittedCodeMap ?? buildEmittedCodeMap(flow, exportedCode, parserSafeCode, options.maxCodeCharsPerStep);
  const context: RecordingReviewContext = {
    schema: 'recording-review-context/v1',
    flowId: flow.flow.id,
    flowName: flow.flow.name,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    reviewMode: options.reviewMode ?? 'manual-review',
    flowSummary: {
      stepCount: flow.steps.length,
      actionCount: countBusinessFlowPlaybackActions(flow),
      assertionsCount: flow.steps.reduce((sum, step) => sum + step.assertions.filter(assertion => assertion.enabled).length, 0),
      repeatSegmentCount: flow.repeatSegments?.length ?? 0,
      hasTerminalAssertions: flow.steps.some(step => step.assertions.some(assertion => assertion.enabled && /row-|modal-|drawer-|selected-value/.test(assertion.type))),
    },
    steps: flow.steps.map(reviewStep),
    generatedArtifacts: {
      exportedCode: exportedCode.slice(0, 20_000),
      parserSafeCode: parserSafeCode.slice(0, 20_000),
      compactFlow: (options.compactFlow ?? toCompactFlow(flow)).slice(0, 20_000),
      emittedCodeMap,
      playbackActionCount: countBusinessFlowPlaybackActions(flow),
    },
    reviewSignals: [],
    locatorDiagnostics: buildLocatorDiagnostics(flow),
    stateTransitions: buildStateTransitions(flow),
    forbiddenRepairs: [
      'Do not return final TypeScript as the repair.',
      'Do not use waitForTimeout as a repair.',
      'Do not use global getByText for critical actions.',
      'Do not use unscoped nth/first/last.',
      'Do not use full DOM, cookies, storage, or URL tokens.',
    ],
    redaction: {
      applied: true,
      notes: [],
    },
  };
  context.reviewSignals = buildRecordingReviewSignals(flow, emittedCodeMap);
  const redacted = redactAiAssistContext(context);
  return {
    ...redacted.value,
    redaction: {
      applied: true,
      notes: redacted.notes,
    },
  };
}

export function buildEmittedCodeMap(flow: BusinessFlow, exportedCode: string, parserSafeCode: string, maxCodeCharsPerStep = 2400): Record<string, EmittedCodeMapEntry> {
  const exportedByStep = stepCodeBlocks(flow, exportedCode, maxCodeCharsPerStep);
  const parserByStep = stepCodeBlocks(flow, parserSafeCode, maxCodeCharsPerStep);
  const result: Record<string, EmittedCodeMapEntry> = {};
  for (const step of flow.steps) {
    const exported = exportedByStep[step.id] || '';
    const parserSafe = parserByStep[step.id] || '';
    const joined = `${exported}\n${parserSafe}`;
    const emitted = /await\s+/.test(joined) && !/has no runnable Playwright action source|skipped unsafe/.test(joined);
    result[step.id] = {
      stepId: step.id,
      emitted,
      exportedCode: exported || undefined,
      parserSafeCode: parserSafe || undefined,
      source: exported && parserSafe ? 'both' : exported ? 'exported' : parserSafe ? 'parser-safe' : undefined,
      skipReason: emitted ? undefined : skipReason(joined),
      risks: generatedSourceRisks(joined),
    };
  }
  return result;
}

function reviewStep(step: FlowStep): RecordingReviewStep {
  return {
    id: step.id,
    order: step.order,
    kind: step.kind,
    action: step.action,
    intent: step.intent,
    target: compactTarget(step.target),
    value: step.value,
    uiRecipe: step.uiRecipe,
    sourceCode: step.sourceCode,
    assertions: step.assertions.map(assertion => ({
      id: assertion.id,
      type: assertion.type,
      enabled: assertion.enabled,
      expected: assertion.expected,
      params: assertion.params,
    })),
    context: {
      before: compactState(step.context?.before),
      after: compactState(step.context?.after),
    },
  };
}

function compactState(state: any): RecordingStateSignature | undefined {
  if (!state)
    return undefined;
  return {
    url: compactUrl(state.url),
    title: state.title,
    activeTab: state.activeTab ? { title: state.activeTab.title, key: state.activeTab.key } : undefined,
    section: state.section ? { title: state.section.title, kind: state.section.kind, testId: state.section.testId } : undefined,
    dialog: state.dialog ? { type: state.dialog.type, title: state.dialog.title, visible: state.dialog.visible, testId: state.dialog.testId } : undefined,
    openedDialog: state.openedDialog ? { type: state.openedDialog.type, title: state.openedDialog.title, visible: state.openedDialog.visible, testId: state.openedDialog.testId } : undefined,
    toast: state.toast,
    form: state.form ? {
      title: state.form.title,
      label: state.form.label,
      name: state.form.name,
      fields: state.form.label || state.form.name || state.form.placeholder || state.form.testId ? [{
        label: state.form.label,
        name: state.form.name,
        placeholder: state.form.placeholder,
        testId: state.form.testId,
        role: state.target?.role,
        valuePreview: state.form.valuePreview,
      }] : undefined,
    } : undefined,
    table: state.table ? {
      title: state.table.title,
      testId: state.table.testId,
      rowKey: state.table.rowKey,
      rowText: state.table.rowText,
      rowIdentity: state.table.rowIdentity,
      columnName: state.table.columnName,
      columnTitle: state.table.columnTitle,
      rowCount: state.table.rowCount,
    } : undefined,
    target: state.target ? {
      role: state.target.role,
      text: state.target.text || state.target.title || state.target.normalizedText,
      name: state.target.name,
      label: state.target.label,
      placeholder: state.target.placeholder,
      testId: state.target.testId,
      controlType: state.target.controlType,
      locatorQuality: state.target.locatorQuality,
      uniqueness: state.target.uniqueness ? {
        pageCount: state.target.uniqueness.pageCount,
        pageIndex: state.target.uniqueness.pageIndex,
      } : undefined,
    } : undefined,
  };
}

function compactTarget(target: FlowStep['target']) {
  if (!target)
    return undefined;
  return {
    role: target.role,
    name: target.name,
    displayName: target.displayName,
    label: target.label,
    placeholder: target.placeholder,
    testId: target.testId,
    text: target.text,
    scope: target.scope,
    locatorHint: target.locatorHint,
  };
}

function buildLocatorDiagnostics(flow: BusinessFlow): LocatorReviewDiagnostic[] {
  return flow.steps.flatMap(step => {
    const diagnostics: LocatorReviewDiagnostic[] = [];
    if (step.target?.locator || step.target?.selector) {
      diagnostics.push({
        stepId: step.id,
        source: 'recorded',
        locator: step.target.locator || step.target.selector,
        strategy: step.target.locatorHint?.strategy,
        scope: JSON.stringify(step.target.scope || {}),
        pageCount: step.target.locatorHint?.pageCount ?? step.context?.before.target?.uniqueness?.pageCount,
        risk: locatorRisk(step),
      });
    }
    const contract = step.uiRecipe ? buildLocatorContract(step.uiRecipe as any, step) : undefined;
    const candidates = [contract?.primaryExecutable, contract?.primaryDiagnostic, ...(contract?.candidates ?? [])].filter(Boolean);
    if (candidates.length) {
      diagnostics.push({
        stepId: step.id,
        source: 'locator-contract',
        strategy: contract?.primaryExecutable?.kind || contract?.primaryDiagnostic?.kind,
        risk: contract?.primaryExecutable ? 'low' : contract?.primaryDiagnostic ? 'medium' : 'high',
        candidates: candidates.slice(0, 5).map((candidate: any) => ({
          kind: candidate.kind,
          value: candidate.payload?.testId || candidate.payload?.role || candidate.payload?.text || candidate.payload?.optionText,
          score: candidate.confidence,
          scope: JSON.stringify(candidate.scope || {}),
          reasons: candidate.evidence,
          risks: candidate.risks?.map((risk: any) => risk.code || risk.reason),
        })),
      });
    }
    return diagnostics;
  });
}

function buildStateTransitions(flow: BusinessFlow): RecordingStateTransition[] {
  return flow.steps.map(step => {
    const after = compactState(step.context?.after);
    const before = compactState(step.context?.before);
    const openedTitle = after?.openedDialog?.title;
    const requiredByLaterStepIds = openedTitle ? flow.steps.filter(candidate => candidate.order > step.order && candidate.context?.before.dialog?.title === openedTitle).map(candidate => candidate.id) : [];
    return {
      stepId: step.id,
      expectedEffect: expectedEffect(step),
      before,
      after,
      requiredByLaterStepIds,
      risk: requiredByLaterStepIds.length ? 'high' : undefined,
    };
  });
}

function expectedEffect(step: FlowStep): RecordingStateTransition['expectedEffect'] {
  if (step.context?.after?.openedDialog)
    return 'opens-dialog';
  if (step.context?.after?.toast)
    return 'shows-toast';
  if (step.context?.before.dialog?.type === 'dropdown' || step.context?.before.target?.controlType?.includes('option'))
    return 'selects-option';
  if (step.uiRecipe?.operation === 'rowAction' || step.uiRecipe?.kind === 'table-row-action' || step.context?.before.table?.rowKey)
    return 'table-row-action';
  if (step.action === 'fill')
    return 'updates-form';
  return 'unknown';
}

function stepCodeBlocks(flow: BusinessFlow, code: string, maxCodeCharsPerStep: number) {
  const result: Record<string, string> = {};
  const stepIds = new Set(flow.steps.map(step => step.id));
  const lines = code.split(/\r?\n/);
  let currentStepId: string | undefined;
  let currentLines: string[] = [];
  const flush = () => {
    if (currentStepId)
      result[currentStepId] = currentLines.join('\n').slice(0, maxCodeCharsPerStep);
    currentLines = [];
  };
  for (const line of lines) {
    const match = line.match(/\/\/\s+(s\d{3,}|step-\d+)\b/);
    if (match && stepIds.has(match[1])) {
      flush();
      currentStepId = match[1];
      currentLines = [line];
      continue;
    }
    if (currentStepId)
      currentLines.push(line);
  }
  flush();
  return result;
}

function skipReason(code: string) {
  if (/has no runnable Playwright action source/.test(code))
    return 'no-runnable-source';
  if (/skipped unsafe/.test(code))
    return 'skipped-unsafe';
  if (!code.trim())
    return 'not-found-in-generated-code';
  return 'no-await-action';
}

function generatedSourceRisks(code: string) {
  const risks: string[] = [];
  if (/page\.getByText\(/.test(code))
    risks.push('global-text');
  if (/page\.getByPlaceholder\(/.test(code))
    risks.push('global-placeholder');
  if (/\.(nth|first|last)\(/.test(code))
    risks.push('ordinal');
  if (/xpath|\/html\/body/.test(code))
    risks.push('xpath');
  return risks;
}

function locatorRisk(step: FlowStep): LocatorReviewDiagnostic['risk'] {
  const pageCount = step.target?.locatorHint?.pageCount ?? step.context?.before.target?.uniqueness?.pageCount;
  if (pageCount && pageCount > 1)
    return 'high';
  if (step.target?.locatorHint?.strategy === 'fallback-text')
    return 'medium';
  return 'low';
}

function compactUrl(value?: string) {
  if (!value)
    return undefined;
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/)[0];
  }
}
