/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import React from 'react';
import type { AiProviderProfile } from '../aiIntent/types';
import type { CrxSettings } from '../settings';

export const GlobalAiAssistCard: React.FC<{
  settings: CrxSettings;
  activeProfile?: AiProviderProfile;
  onOpenSettings: () => void;
}> = ({ settings, activeProfile, onOpenSettings }) => {
  const enabled = !!settings.aiAssistEnabled;
  const reviewOnStop = enabled && !!settings.aiAssistReviewOnStopRecording;
  const repairButton = settings.aiAssistRepairOnFailureButton !== false;
  return <section className='global-ai-card ai-compact-card'>
    <div className='global-ai-title ai-compact-head'>
      <div>
        <strong>AI 审查全局配置</strong>
        <span>停止录制审查和回放失败修复共用同一个 Provider。</span>
      </div>
      <span className='pill'>AI</span>
    </div>
    <div className='global-ai-grid compact-metrics' aria-label='AI 审查配置摘要'>
      <div>
        <span>状态</span>
        <strong>{enabled ? '已启用' : '未启用'}</strong>
      </div>
      <div>
        <span>Provider</span>
        <strong>{activeProfile?.name || '未配置'}</strong>
      </div>
      <div>
        <span>停止后</span>
        <strong>{reviewOnStop ? '自动审查' : '手动审查'}</strong>
      </div>
      <div>
        <span>修复按钮</span>
        <strong>{repairButton ? '显示' : '隐藏'}</strong>
      </div>
    </div>
    <div className='global-ai-actions button-group'>
      <button type='button' className='mini-button' onClick={onOpenSettings}>设置</button>
    </div>
  </section>;
};
