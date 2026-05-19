/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { redactAiAssistText } from './redactor';
import type { RecordingReviewContext, RecordingReviewStep } from './review/types';
import type { ReplayRepairContext } from './repair/types';

const PROMPT_HEAD_RATIO = 0.62;

export function stringifyPromptContext(value: unknown, maxContextChars: number): string {
  return truncateMiddle(redactAiAssistText(JSON.stringify(value), Number.MAX_SAFE_INTEGER), maxContextChars);
}

export function truncateMiddle(value: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || maxChars <= 0)
    return '';
  if (value.length <= maxChars)
    return value;
  if (maxChars < 40)
    return value.slice(0, maxChars);
  const marker = '\n...[truncated for AI prompt]...\n';
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.floor(available * PROMPT_HEAD_RATIO);
  const tail = available - head;
  return `${value.slice(0, head)}${marker}${value.slice(value.length - tail)}`;
}

export function compactRecordingReviewContextForPrompt(context: RecordingReviewContext) {
  const relevantStepIds = reviewRelevantStepIds(context);
  return {
    schema: context.schema,
    flowId: context.flowId,
    flowName: context.flowName,
    generatedAt: context.generatedAt,
    reviewMode: context.reviewMode,
    flowSummary: context.flowSummary,
    reviewSignals: context.reviewSignals,
    stateTransitions: prioritizeByStepIds(context.stateTransitions, relevantStepIds),
    locatorDiagnostics: prioritizeByStepIds(context.locatorDiagnostics, relevantStepIds),
    generatedArtifacts: {
      emittedCodeMap: context.generatedArtifacts.emittedCodeMap,
      playbackActionCount: context.generatedArtifacts.playbackActionCount,
      parserSafeCodeExcerpt: truncateMiddle(context.generatedArtifacts.parserSafeCode || '', 6000),
      exportedCodeExcerpt: truncateMiddle(context.generatedArtifacts.exportedCode || '', 4000),
    },
    steps: selectReviewRelevantSteps(context.steps, relevantStepIds),
    forbiddenRepairs: context.forbiddenRepairs,
    redaction: context.redaction,
  };
}

export function compactReplayRepairContextForPrompt(context: ReplayRepairContext) {
  const windowStepIds = new Set(context.causalWindow.stepIds);
  windowStepIds.add(context.failure.symptomStepId);
  windowStepIds.add(context.causalWindow.rootCauseStepId);
  if (context.firstDivergence?.stepId)
    windowStepIds.add(context.firstDivergence.stepId);

  return {
    schema: context.schema,
    flowId: context.flowId,
    generatedAt: context.generatedAt,
    failure: context.failure,
    firstDivergence: context.firstDivergence,
    causalWindow: context.causalWindow,
    previousReviewSummary: summarizePreviousReview(context.previousReview),
    replayTrace: context.replayTrace,
    emittedCodeMap: pickRecordByIds(context.emittedCodeMap, windowStepIds),
    steps: context.steps.filter(step => windowStepIds.has(step.id)),
    locatorDiagnostics: filterDiagnosticsByIds(context.locatorDiagnostics, windowStepIds),
    availableActionCandidates: context.availableActionCandidates,
    flowSummary: context.flowSummary,
    redaction: context.redaction,
  };
}

function reviewRelevantStepIds(context: RecordingReviewContext): Set<string> {
  const ids = new Set<string>();
  for (const signal of context.reviewSignals) {
    ids.add(signal.stepId);
    for (const related of signal.relatedStepIds || [])
      ids.add(related);
  }
  for (const transition of context.stateTransitions) {
    if (transition.risk && transition.risk !== 'low')
      ids.add(transition.stepId);
    for (const dependent of transition.requiredByLaterStepIds || []) {
      ids.add(transition.stepId);
      ids.add(dependent);
    }
  }
  for (const diagnostic of context.locatorDiagnostics) {
    if (diagnostic.risk && diagnostic.risk !== 'low')
      ids.add(diagnostic.stepId);
  }
  for (const [stepId, entry] of Object.entries(context.generatedArtifacts.emittedCodeMap)) {
    if (!entry.emitted || entry.risks?.length)
      ids.add(stepId);
  }
  return ids;
}

function selectReviewRelevantSteps(steps: RecordingReviewStep[], relevantStepIds: Set<string>): RecordingReviewStep[] {
  if (!relevantStepIds.size || steps.length <= 16)
    return steps;
  const indexes = new Set<number>();
  steps.forEach((step, index) => {
    if (!relevantStepIds.has(step.id))
      return;
    indexes.add(Math.max(0, index - 1));
    indexes.add(index);
    indexes.add(Math.min(steps.length - 1, index + 1));
  });
  steps.slice(0, 2).forEach((_, index) => indexes.add(index));
  steps.slice(-2).forEach((_, index) => indexes.add(steps.length - 2 + index));
  return [...indexes].sort((a, b) => a - b).map(index => steps[index]).filter(Boolean);
}

function prioritizeByStepIds<T extends { stepId: string }>(items: T[], ids: Set<string>): T[] {
  if (!ids.size)
    return items;
  return [...items.filter(item => ids.has(item.stepId)), ...items.filter(item => !ids.has(item.stepId))];
}

function pickRecordByIds(record: Record<string, unknown>, ids: Set<string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const id of ids) {
    if (record[id] !== undefined)
      result[id] = record[id];
  }
  return result;
}

function filterDiagnosticsByIds(diagnostics: unknown[], ids: Set<string>): unknown[] {
  return diagnostics.filter(diagnostic => {
    const stepId = diagnostic && typeof diagnostic === 'object' ? (diagnostic as { stepId?: unknown }).stepId : undefined;
    return typeof stepId !== 'string' || ids.has(stepId);
  });
}

function summarizePreviousReview(previousReview: ReplayRepairContext['previousReview']) {
  if (!previousReview)
    return undefined;
  const patch = previousReview.patch;
  const context = previousReview.context;
  return {
    context: context ? {
      flowId: context.flowId,
      flowSummary: context.flowSummary,
      reviewSignals: context.reviewSignals,
      stateTransitions: context.stateTransitions,
    } : undefined,
    patch: patch ? {
      diagnosis: patch.diagnosis,
      issues: patch.issues,
      patches: patch.patches,
      validationPlan: patch.validationPlan,
      autoApplyEligibility: patch.autoApplyEligibility,
    } : undefined,
  };
}
