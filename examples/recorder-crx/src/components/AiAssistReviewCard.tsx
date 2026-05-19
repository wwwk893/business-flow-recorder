/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import React from 'react';
import type { ReplayRepairValidationResult, RecordingReviewPatch, RecordingReviewValidationResult } from '../aiAssist';

export type AiAssistReviewState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  message?: string;
  patch?: RecordingReviewPatch;
  validation?: RecordingReviewValidationResult;
  requestId?: string;
};

export type AiAssistRepairState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  message?: string;
  validation?: ReplayRepairValidationResult;
  requestId?: string;
};

export const AiAssistReviewCard: React.FC<{
  review: AiAssistReviewState;
  repair: AiAssistRepairState;
  onRunReview: () => void;
  onApplyReviewPatch: () => void;
  onRepairAndRetry: () => void;
  onRollbackRepair: () => void;
}> = ({ review, repair, onRunReview, onApplyReviewPatch, onRepairAndRetry, onRollbackRepair }) => {
  const issueCount = review.patch?.issues.length ?? 0;
  return <section className='ai-assist-card' aria-label='AI Review 与 AI Repair'>
    <div className='section-title'>
      <strong>AI Review / Repair</strong>
      <span>{review.status === 'running' ? 'AI 正在审查规则生成回放代码...' : review.message || '插件内调用 Provider，自动构造并脱敏上下文。'}</span>
    </div>
    <div className='review-stack'>
      <div className='review-card'>
        <span className={`risk ${riskClass(review.patch?.diagnosis.overallRisk, review.status)}`}>{review.patch?.diagnosis.overallRisk?.toUpperCase() || review.status}</span>
        <div>
          <strong>{review.patch?.diagnosis.summary || '停止录制 AI 审查'}</strong>
          <span>{issueCount ? `${issueCount} 个潜在问题；${review.validation?.ok ? '验证通过' : review.validation?.errors.join('；') || '等待验证'}` : '一键审查当前 flow/code/locator/safety signals。'}</span>
        </div>
        <button type='button' className='mini-button' disabled={review.status === 'running'} onClick={onRunReview}>AI 审查</button>
      </div>
      {!!review.patch?.issues.length && <div className='review-card'>
        <span className={`risk ${riskClass(review.patch.diagnosis.overallRisk)}`}>{review.patch.diagnosis.overallRisk.toUpperCase()}</span>
        <div>
          <strong>{review.patch.issues[0].issueKind}: {review.patch.issues[0].rootCauseStepId}</strong>
          <span>{review.patch.issues[0].reason}</span>
        </div>
        <button type='button' className='mini-button' disabled={!review.validation?.ok || !review.validation?.autoApply} onClick={onApplyReviewPatch}>应用并验证</button>
      </div>}
      <div className='review-card'>
        <span className={`risk ${repair.status === 'error' ? 'p1' : repair.status === 'ready' ? 'ok' : 'p1'}`}>{repair.status}</span>
        <div>
          <strong>回放失败 AI 修复并重试</strong>
          <span>{repair.message || '失败后自动收集上下文，模型只返回结构化 patch，插件校验后临时应用。'}</span>
        </div>
        <button type='button' className='mini-button' disabled={repair.status === 'running'} onClick={onRepairAndRetry}>AI 修复并重试</button>
        <button type='button' className='mini-button' disabled={repair.status === 'idle'} onClick={onRollbackRepair}>回滚</button>
      </div>
    </div>
  </section>;
};

function riskClass(risk?: string, status?: string) {
  if (status === 'error' || risk === 'critical' || risk === 'high')
    return 'p0';
  if (risk === 'medium' || status === 'running')
    return 'p1';
  return 'ok';
}
