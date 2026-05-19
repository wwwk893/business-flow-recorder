/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { BusinessFlow } from '../../flow/types';
import type { AiAssistProvider, AiAssistProviderConfig } from '../types';
import { buildRecordingReviewContext, type BuildRecordingReviewContextOptions } from './reviewContextBuilder';
import { parseRecordingReviewPatch } from './reviewPatchParser';
import { buildRecordingReviewPrompt } from './reviewPrompt';
import { applyAndValidateRecordingReviewPatch } from './reviewValidator';
import type { RecordingReviewContext, RecordingReviewPatch, RecordingReviewValidationResult } from './types';

export interface RecordingReviewServiceResult {
  context: RecordingReviewContext;
  prompt: string;
  rawOutput?: string;
  patch?: RecordingReviewPatch;
  validation?: RecordingReviewValidationResult;
  error?: string;
  requestId?: string;
}

export async function reviewRecordingWithAiAssist(args: {
  flow: BusinessFlow;
  provider: AiAssistProvider;
  config: AiAssistProviderConfig;
  contextOptions?: BuildRecordingReviewContextOptions;
  signal?: AbortSignal;
}): Promise<RecordingReviewServiceResult> {
  const context = buildRecordingReviewContext(args.flow, {
    ...args.contextOptions,
    reviewMode: args.contextOptions?.reviewMode ?? 'stop-recording',
  });
  const prompt = buildRecordingReviewPrompt(context, args.config.maxContextChars);
  try {
    const response = await args.provider.reviewRecording({ context, prompt, signal: args.signal });
    const patch = parseRecordingReviewPatch(response.rawOutput, context);
    const validation = applyAndValidateRecordingReviewPatch(args.flow, context, patch);
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
