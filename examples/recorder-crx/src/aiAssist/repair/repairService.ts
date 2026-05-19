/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import type { AiAssistProvider, AiAssistProviderConfig } from '../types';
import { buildReplayRepairContext } from './repairContextBuilder';
import { parseReplayRepairPatch } from './repairPatchParser';
import { buildReplayRepairPrompt } from './repairPrompt';
import { validateReplayRepairPatch } from './repairValidator';
import type { RecordingReviewContext, RecordingReviewPatch } from '../review/types';
import type { ReplayRepairFailure, ReplayRepairPatch, ReplayRepairContext, ReplayRepairValidationResult } from './types';

export interface ReplayRepairServiceResult {
  context: ReplayRepairContext;
  prompt: string;
  rawOutput?: string;
  patch?: ReplayRepairPatch;
  validation?: ReplayRepairValidationResult;
  error?: string;
  requestId?: string;
}

export async function repairReplayFailureWithAiAssist(args: {
  flow: BusinessFlow;
  failure: ReplayRepairFailure;
  provider: AiAssistProvider;
  config: AiAssistProviderConfig;
  previousReviewContext?: RecordingReviewContext;
  previousReviewPatch?: RecordingReviewPatch;
  signal?: AbortSignal;
}): Promise<ReplayRepairServiceResult> {
  const context = buildReplayRepairContext({
    flow: args.flow,
    failure: args.failure,
    previousReviewContext: args.previousReviewContext,
    previousReviewPatch: args.previousReviewPatch,
  });
  const prompt = buildReplayRepairPrompt(context, args.config.maxContextChars);
  try {
    const response = await args.provider.repairReplayFailure({ context, prompt, signal: args.signal });
    const patch = parseReplayRepairPatch(response.rawOutput, context);
    const validation = validateReplayRepairPatch(args.flow, context, patch);
    return {
      context,
      prompt,
      rawOutput: response.rawOutput,
      patch,
      validation,
      requestId: response.requestId,
    };
  } catch (error) {
    return {
      context,
      prompt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
