/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export { createAiAssistProvider, DisabledProvider, HttpAiAssistProvider, MockProvider } from './provider';
export { defaultAiAssistProviderConfig, normalizeAiAssistProviderConfig } from './providerConfig';
export { redactAiAssistContext, redactAiAssistText, redactAiAssistValue } from './redactor';
export type { AiAssistProvider, AiAssistProviderConfig, AiAssistProviderKind, AiAssistRawResponse } from './types';

export { buildRecordingReviewContext, buildEmittedCodeMap } from './review/reviewContextBuilder';
export { buildRecordingReviewPrompt } from './review/reviewPrompt';
export { parseRecordingReviewPatch, validateRecordingReviewPatchShape } from './review/reviewPatchParser';
export { applyRecordingReviewPatch } from './review/reviewPatchApplier';
export { applyAndValidateRecordingReviewPatch, validateRecordingReviewPatch } from './review/reviewValidator';
export { reviewRecordingWithAiAssist } from './review/reviewService';
export { buildRecordingReviewSignals } from './review/reviewSignals';
export type { RecordingReviewContext, RecordingReviewPatch, RecordingReviewSignal, RecordingReviewValidationResult } from './review/types';

export { buildReplayRepairContext } from './repair/repairContextBuilder';
export { buildReplayCausalWindow } from './repair/causalWindow';
export { buildReplayRepairPrompt } from './repair/repairPrompt';
export { parseReplayRepairPatch, validateReplayRepairPatchShape } from './repair/repairPatchParser';
export { applyReplayRepairPatch } from './repair/repairPatchApplier';
export { validateReplayRepairPatch } from './repair/repairValidator';
export { repairReplayFailureWithAiAssist } from './repair/repairService';
export type { ReplayRepairContext, ReplayRepairFailure, ReplayRepairPatch, ReplayRepairValidationResult } from './repair/types';
