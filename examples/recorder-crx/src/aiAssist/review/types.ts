/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { FlowStep } from '../../flow/types';

export type RecordingReviewMode = 'stop-recording' | 'manual-review' | 'pre-export';
export type RecordingReviewSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RecordingReviewRisk = 'low' | 'medium' | 'high' | 'critical';

export interface RecordingReviewContext {
  schema: 'recording-review-context/v1';
  flowId: string;
  flowName?: string;
  generatedAt: string;
  reviewMode: RecordingReviewMode;
  flowSummary: {
    stepCount: number;
    actionCount: number;
    assertionsCount: number;
    repeatSegmentCount?: number;
    hasTerminalAssertions: boolean;
  };
  steps: RecordingReviewStep[];
  generatedArtifacts: {
    exportedCode?: string;
    parserSafeCode?: string;
    compactFlow?: string;
    emittedCodeMap: Record<string, EmittedCodeMapEntry>;
    playbackActionCount?: number;
  };
  reviewSignals: RecordingReviewSignal[];
  locatorDiagnostics: LocatorReviewDiagnostic[];
  stateTransitions: RecordingStateTransition[];
  forbiddenRepairs: string[];
  redaction: {
    applied: boolean;
    notes: string[];
  };
}

export interface RecordingReviewStep {
  id: string;
  order: number;
  kind?: string;
  action: string;
  intent?: string;
  target?: unknown;
  value?: string;
  uiRecipe?: unknown;
  sourceCode?: string;
  assertions?: unknown[];
  context?: {
    before?: RecordingStateSignature;
    after?: RecordingStateSignature;
  };
}

export interface RecordingStateSignature {
  url?: string;
  title?: string;
  activeTab?: { title?: string; key?: string };
  section?: { title?: string; kind?: string; testId?: string };
  dialog?: { type?: string; title?: string; visible?: boolean; testId?: string };
  openedDialog?: { type?: string; title?: string; visible?: boolean; testId?: string };
  toast?: string;
  form?: {
    title?: string;
    label?: string;
    name?: string;
    labels?: string[];
    fields?: Array<{
      label?: string;
      name?: string;
      placeholder?: string;
      testId?: string;
      role?: string;
      valuePreview?: string;
    }>;
  };
  table?: {
    title?: string;
    testId?: string;
    rowKey?: string;
    rowText?: string;
    rowIdentity?: unknown;
    columnName?: string;
    columnTitle?: string;
    rowCount?: number;
  };
  target?: {
    role?: string;
    text?: string;
    name?: string;
    label?: string;
    placeholder?: string;
    testId?: string;
    controlType?: string;
    locatorQuality?: string;
    uniqueness?: {
      pageCount?: number;
      pageIndex?: number;
    };
  };
}

export interface EmittedCodeMapEntry {
  stepId: string;
  emitted: boolean;
  exportedCode?: string;
  parserSafeCode?: string;
  strategy?: string;
  skipReason?: string;
  source?: 'exported' | 'parser-safe' | 'both';
  risks?: string[];
}

export type RecordingReviewSignalKind =
  | 'not-emitted'
  | 'weak-locator'
  | 'global-placeholder'
  | 'global-text'
  | 'unscoped-dialog-action'
  | 'unscoped-table-row-action'
  | 'missing-state-transition'
  | 'downstream-state-dependency'
  | 'select-trigger-option-mismatch'
  | 'readonly-select-fill-risk'
  | 'duplicate-testid'
  | 'terminal-assertion-risk'
  | 'safety-preflight-blocked';

export interface RecordingReviewSignal {
  stepId: string;
  severity: RecordingReviewSeverity;
  kind: RecordingReviewSignalKind;
  message: string;
  evidence?: unknown;
  relatedStepIds?: string[];
}

export interface RecordingStateTransition {
  stepId: string;
  expectedEffect:
    | 'opens-dialog'
    | 'closes-dialog'
    | 'shows-toast'
    | 'updates-form'
    | 'selects-option'
    | 'navigates-tab'
    | 'opens-dropdown'
    | 'table-row-action'
    | 'unknown';
  before?: RecordingStateSignature;
  after?: RecordingStateSignature;
  requiredByLaterStepIds?: string[];
  risk?: 'low' | 'medium' | 'high';
}

export interface LocatorReviewDiagnostic {
  stepId: string;
  source: 'recorded' | 'generated' | 'locator-contract' | 'runtime-audit';
  locator?: string;
  strategy?: string;
  scope?: string;
  pageCount?: number;
  visibleCount?: number;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  candidates?: Array<{
    kind?: string;
    value?: string;
    score?: number;
    scope?: string;
    reasons?: string[];
    risks?: string[];
  }>;
}

export type RecordingReviewIssueKind =
  | 'missing-emitted-step'
  | 'weak-locator'
  | 'missing-state-transition'
  | 'propagated-failure-risk'
  | 'unscoped-table-row-action'
  | 'unscoped-dialog-field'
  | 'select-trigger-option-risk'
  | 'terminal-assertion-risk'
  | 'false-positive-none';

export interface RecordingReviewPatch {
  schema: 'recording-review-patch/v1';
  flowId?: string;
  diagnosis: {
    overallRisk: RecordingReviewRisk;
    summary: string;
    issueCount: number;
  };
  issues: Array<{
    issueId: string;
    issueKind: RecordingReviewIssueKind;
    severity: RecordingReviewSeverity;
    rootCauseStepId: string;
    affectedStepIds: string[];
    reason: string;
    evidence: string[];
  }>;
  patches: RecordingReviewPatchOperation[];
  validationPlan: string[];
  autoApplyEligibility: {
    eligible: boolean;
    reason: string;
    maxRisk: RecordingReviewRisk;
  };
}

export type RecordingReviewPatchOperation =
  | {
      op: 'force-emit-step';
      stepId: string;
      reason: string;
    }
  | {
      op: 'replace-recipe';
      stepId: string;
      recipe: unknown;
      reason: string;
    }
  | {
      op: 'replace-locator-scope';
      stepId: string;
      scope: unknown;
      reason: string;
    }
  | {
      op: 'add-locator-contract-hint';
      stepId: string;
      locatorContractHint: unknown;
      reason: string;
    }
  | {
      op: 'mark-needs-human-review';
      stepId: string;
      reason: string;
    };

export interface RecordingReviewValidationResult {
  ok: boolean;
  autoApply: boolean;
  appliedFlow?: unknown;
  errors: string[];
  warnings: string[];
}

export function stepIdsFromReviewContext(context: RecordingReviewContext) {
  return new Set(context.steps.map(step => step.id));
}

export function stepFromReviewContext(context: RecordingReviewContext, stepId: string): RecordingReviewStep | undefined {
  return context.steps.find(step => step.id === stepId);
}

export function flowStepLabel(step: Pick<FlowStep, 'id' | 'order'>) {
  return `${step.id}#${step.order}`;
}
