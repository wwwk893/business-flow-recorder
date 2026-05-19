/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import { countBusinessFlowPlaybackActions, generateBusinessFlowPlaybackCode, generateBusinessFlowPlaywrightCode } from '../../replay';
import { redactAiAssistContext } from '../redactor';
import { buildEmittedCodeMap } from '../review/reviewContextBuilder';
import type { RecordingReviewContext, RecordingReviewPatch } from '../review/types';
import { buildReplayCausalWindow } from './causalWindow';
import { buildReplayTrace } from './replayTrace';
import type { ReplayRepairContext, ReplayRepairFailure } from './types';

export function buildReplayRepairContext(args: {
  flow: BusinessFlow;
  failure: ReplayRepairFailure;
  previousReviewContext?: RecordingReviewContext;
  previousReviewPatch?: RecordingReviewPatch;
  generatedAt?: string;
}): ReplayRepairContext {
  const exportedCode = generateBusinessFlowPlaywrightCode(args.flow);
  const parserSafeCode = generateBusinessFlowPlaybackCode(args.flow);
  const emittedCodeMap = buildEmittedCodeMap(args.flow, exportedCode, parserSafeCode);
  const causalWindow = buildReplayCausalWindow(args.flow, args.failure);
  const replayTrace = buildReplayTrace(args.flow, args.failure);
  const context: ReplayRepairContext = {
    schema: 'replay-repair-context/v1',
    flowId: args.flow.flow.id,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    failure: args.failure,
    flowSummary: {
      stepCount: args.flow.steps.length,
      actionCount: countBusinessFlowPlaybackActions(args.flow),
    },
    steps: args.flow.steps.map(step => ({
      id: step.id,
      order: step.order,
      action: step.action,
      target: step.target,
      value: step.value,
      sourceCode: step.sourceCode,
      context: step.context,
      uiRecipe: step.uiRecipe,
    })),
    emittedCodeMap,
    replayTrace,
    firstDivergence: replayTrace.stateDiffs[0] ? {
      stepId: args.failure.symptomStepId,
      reason: JSON.stringify(replayTrace.stateDiffs[0]),
    } : undefined,
    causalWindow,
    locatorDiagnostics: [],
    availableActionCandidates: [],
    previousReview: args.previousReviewContext || args.previousReviewPatch ? {
      context: args.previousReviewContext,
      patch: args.previousReviewPatch,
    } : undefined,
    redaction: { applied: true, notes: [] },
  };
  const redacted = redactAiAssistContext(context);
  return {
    ...redacted.value,
    redaction: {
      applied: true,
      notes: redacted.notes,
    },
  };
}
