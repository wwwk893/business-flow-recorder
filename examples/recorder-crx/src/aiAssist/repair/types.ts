/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import type { RecordingReviewContext, RecordingReviewPatch } from '../review/types';

export type ReplayRepairFailureKind =
  | 'current-step-locator'
  | 'propagated-missing-step'
  | 'propagated-wrong-step'
  | 'propagated-skipped-step'
  | 'extra-step-state-drift'
  | 'assertion-obsolete'
  | 'application-behavior-change'
  | 'unsafe-repair-rejected';

export interface ReplayRepairPatch {
  schema: 'replay-repair-patch/v1';
  flowId?: string;
  diagnosis: {
    failureKind: ReplayRepairFailureKind;
    symptomStepId: string;
    rootCauseStepId: string;
    confidence: number;
    reason: string;
  };
  patches: ReplayRepairPatchOperation[];
  validationPlan: string[];
  risk: {
    level: 'low' | 'medium' | 'high';
    unsafePatterns: string[];
    notes?: string;
  };
}

export type ReplayRepairPatchOperation =
  | {
      op: 'insert-step' | 'unskip-step' | 'replace-recipe' | 'replace-locator' | 'replace-locator-scope' | 'delete-step' | 'add-assertion' | 'update-assertion';
      stepId: string;
      insertBeforeStepId?: string;
      insertAfterStepId?: string;
      recipe?: unknown;
      locator?: unknown;
      scope?: unknown;
      reason: string;
    };

export interface ReplayRepairFailure {
  symptomStepId: string;
  errorType?: string;
  errorText: string;
  failedCode?: string;
  actualBefore?: unknown;
  actualAfter?: unknown;
}

export interface ReplayRepairContext {
  schema: 'replay-repair-context/v1';
  flowId: string;
  generatedAt: string;
  failure: ReplayRepairFailure;
  flowSummary: {
    stepCount: number;
    actionCount: number;
  };
  steps: Array<{
    id: string;
    order: number;
    action: string;
    target?: unknown;
    value?: string;
    sourceCode?: string;
    context?: unknown;
    uiRecipe?: unknown;
  }>;
  emittedCodeMap: Record<string, unknown>;
  replayTrace: {
    expectedStates: unknown[];
    actualStates: unknown[];
    stateDiffs: unknown[];
  };
  firstDivergence?: {
    stepId: string;
    reason: string;
  };
  causalWindow: {
    symptomStepId: string;
    rootCauseStepId: string;
    stepIds: string[];
    reason: string;
  };
  locatorDiagnostics: unknown[];
  availableActionCandidates: unknown[];
  previousReview?: {
    context?: RecordingReviewContext;
    patch?: RecordingReviewPatch;
  };
  redaction: {
    applied: boolean;
    notes: string[];
  };
}

export interface ReplayRepairValidationResult {
  ok: boolean;
  appliedFlow?: BusinessFlow;
  errors: string[];
  warnings: string[];
  rootCauseStepId?: string;
}
