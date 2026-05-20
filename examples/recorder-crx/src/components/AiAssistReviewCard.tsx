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
  onOpenReplay?: () => void;
  onRestoreOriginal?: () => void;
  showRepairButton?: boolean;
}> = ({ review, repair, onRunReview, onApplyReviewPatch, onRepairAndRetry, onRollbackRepair, onOpenReplay, onRestoreOriginal, showRepairButton = true }) => {
  const issueCount = review.patch?.issues.length ?? 0;
  const reviewApplyHint = review.validation?.autoApply
    ? '推荐版本已应用。'
    : review.validation?.ok
      ? '已通过检查，可确认应用推荐版本。'
      : review.validation?.errors.join('；') || '等待验证';
  const reviewTitle = review.status === 'running'
    ? '正在生成推荐版本'
    : review.status === 'error'
      ? 'AI 未应用，继续使用原始规则版'
      : review.validation?.autoApply
        ? '推荐版本已生成'
        : review.validation?.ok
          ? '推荐版本待应用'
          : '停止录制后自动优化';
  const reviewDetail = review.status === 'running'
    ? '正在保存原始规则版、审查步骤和安全规则。'
    : review.status === 'error'
      ? review.message || 'AI 优化失败，当前流程仍使用原始规则版。'
      : issueCount
        ? `${issueCount} 个问题已处理；${reviewApplyHint}`
        : '保留原始规则版，AI 只返回结构化修改，插件校验后才应用。';
  const reviewBadge = review.status === 'running' ? '优化中' : review.status === 'error' ? '未应用' : review.validation?.autoApply ? '已应用' : review.validation?.ok ? '待应用' : '待优化';
  const canApply = !!review.validation?.ok && !review.validation.autoApply && review.status !== 'running';
  return <section className='ai-assist-card' aria-label='AI Review 与 AI Repair'>
    <div className='section-title'>
      <strong>AI 自动优化</strong>
      <span>{review.status === 'running' ? '正在优化当前流程，原始规则版会保留。' : review.message || '测试人员只需要看当前版本能否回放，工程细节默认折叠。'}</span>
    </div>
    <div className='review-stack'>
      <div className='review-card'>
        <span className={`risk ${riskClass(review.patch?.diagnosis.overallRisk, review.status)}`}>{reviewBadge}</span>
        <div>
          <strong>{review.patch?.diagnosis.summary || reviewTitle}</strong>
          <span>{reviewDetail}</span>
        </div>
        <button type='button' className='mini-button' disabled={review.status === 'running'} onClick={onRunReview}>{review.status === 'idle' ? 'AI 优化' : '重新优化'}</button>
      </div>
      {!!review.patch?.issues.length && <div className='review-card'>
        <span className={`risk ${riskClass(review.patch.diagnosis.overallRisk)}`}>{review.patch.diagnosis.overallRisk.toUpperCase()}</span>
        <div>
          <strong>{userFacingIssueKind(review.patch.issues[0].issueKind)}</strong>
          <span>{review.patch.issues[0].reason} {reviewApplyHint}</span>
        </div>
        <button type='button' className='mini-button' disabled={!canApply} onClick={onApplyReviewPatch}>{review.validation?.autoApply ? '已应用' : '应用推荐版'}</button>
      </div>}
      {(review.status === 'ready' || review.status === 'error') && <div className='version-actions-row'>
        {onOpenReplay && <button type='button' className='primary-button' onClick={onOpenReplay}>进入回放</button>}
        {onRestoreOriginal && <button type='button' className='mini-button' onClick={onRestoreOriginal}>恢复原始规则版</button>}
      </div>}
      {showRepairButton && <div className='review-card'>
        <span className={`risk ${repair.status === 'error' ? 'p1' : repair.status === 'ready' ? 'ok' : 'p1'}`}>{repair.status}</span>
        <div>
          <strong>回放失败后自动修复</strong>
          <span>{repair.message || '失败后收集上下文，生成修复尝试版，保留失败前版本。'}</span>
        </div>
        <button type='button' className='mini-button' disabled={repair.status === 'running'} onClick={onRepairAndRetry}>AI 修复并重试</button>
        <button type='button' className='mini-button' disabled={repair.status === 'idle'} onClick={onRollbackRepair}>回滚</button>
      </div>}
      {!!review.patch?.issues.length && <details className='developer-details'>
        <summary>开发者详情</summary>
        <div>{review.patch.issues.map(issue => <p key={issue.issueId}><strong>{issue.rootCauseStepId}</strong> → {issue.affectedStepIds.join(', ') || '当前步骤'}：{issue.issueKind}</p>)}</div>
      </details>}
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

function userFacingIssueKind(kind: string) {
  if (kind === 'propagated-failure-risk' || kind === 'missing-state-transition')
    return '前置步骤可能缺失';
  if (kind === 'missing-emitted-step')
    return '步骤未进入回放';
  if (kind === 'weak-locator' || kind === 'unscoped-dialog-field')
    return '目标定位不够稳定';
  if (kind === 'select-trigger-option-risk')
    return '下拉选择需要优化';
  if (kind === 'terminal-assertion-risk')
    return '断言需要确认';
  return '建议优化';
}
