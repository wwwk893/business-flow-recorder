/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import React from 'react';
import { GlobalAiIntentCard } from './GlobalAiIntentCard';
import { GlobalAiAssistCard } from './GlobalAiAssistCard';
import type { AiIntentSettings, AiProviderProfile, AiUsageRecord } from '../aiIntent/types';
import { flowStats } from '../flow/display';
import type { BusinessFlow } from '../flow/types';
import type { CrxSettings } from '../settings';

type FlowLibraryFilter = 'all' | 'draft' | 'done' | 'high';

export const FlowLibraryPanel: React.FC<{
  records: BusinessFlow[];
  selectedRecordId?: string;
  draftStatus: string;
  onNewFlow: () => void;
  onOpenRecord: (flow: BusinessFlow) => void;
  onEditRecord: (flow: BusinessFlow) => void;
  onDuplicateRecord: (flow: BusinessFlow) => void;
  onDeleteRecord: (flow: BusinessFlow) => void;
  onRestoreRecord: (flow: BusinessFlow) => void;
  onImportJson: (file: File) => void;
  onExportAll: () => void;
  aiSettings: AiIntentSettings;
  crxSettings: CrxSettings;
  aiProfiles: AiProviderProfile[];
  activeAiProfile?: AiProviderProfile;
  aiUsageRecords: AiUsageRecord[];
  onAiSettingsChange: (settings: AiIntentSettings) => void;
  onOpenAiSettings: () => void;
  onOpenAiUsage: () => void;
}> = ({
  records,
  selectedRecordId,
  draftStatus,
  onNewFlow,
  onOpenRecord,
  onEditRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onRestoreRecord,
  onImportJson,
  onExportAll,
  aiSettings,
  crxSettings,
  aiProfiles,
  activeAiProfile,
  aiUsageRecords,
  onAiSettingsChange,
  onOpenAiSettings,
  onOpenAiUsage,
}) => {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<FlowLibraryFilter>('all');
  const [deletingFlow, setDeletingFlow] = React.useState<BusinessFlow>();
  const [deleteConfirmed, setDeleteConfirmed] = React.useState(false);
  const [lastDeletedFlow, setLastDeletedFlow] = React.useState<BusinessFlow>();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredRecords = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter(flow => {
      if (!matchesFilter(flow, filter))
        return false;
      if (!normalizedQuery)
        return true;
      const haystack = [
        flow.flow.name,
        flow.flow.app,
        flow.flow.repo,
        flow.flow.module,
        flow.flow.page,
        flow.flow.role,
        flow.flow.priority,
        ...(flow.flow.tags ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [filter, query, records]);

  return <div className='flow-library'>
    <div className='library-section section'>
      <div className='library-heading library-header'>
        <div>
          <h2>业务流程记录</h2>
          <span>共 {records.length} 条记录</span>
        </div>
        <div className='library-heading-actions library-actions'>
          <button type='button' className='primary primary-button' onClick={onNewFlow}>+ 新建流程</button>
          <button type='button' className='quiet-button' onClick={() => fileInputRef.current?.click()}>导入 JSON</button>
          <input
            ref={fileInputRef}
            hidden
            type='file'
            accept='.json,application/json'
            onChange={e => {
              const file = e.target.files?.[0];
              if (file)
                onImportJson(file);
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>
    </div>

    <div className='library-section section'>
      <div className='toolbar-compact'>
        <label className='search-field'>
          <span className='sr-only'>搜索流程</span>
          <input
            className='library-search'
            type='search'
            value={query}
            placeholder='搜索流程名称 / 模块 / 标签'
            onChange={e => setQuery(e.target.value)}
          />
        </label>

        <div className='library-filters filter-row'>
          <div className='filter-chips' aria-label='流程筛选'>
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>全部</FilterButton>
            <FilterButton active={filter === 'draft'} onClick={() => setFilter('draft')}>草稿</FilterButton>
            <FilterButton active={filter === 'done'} onClick={() => setFilter('done')}>已完成</FilterButton>
            <FilterButton active={filter === 'high'} onClick={() => setFilter('high')}>高优先级</FilterButton>
          </div>
          <button type='button' className='filter-menu mini-button'>筛选</button>
        </div>
      </div>
    </div>

    <div className='library-section section library-ai-section'>
      <GlobalAiIntentCard
        settings={aiSettings}
        profiles={aiProfiles}
        activeProfile={activeAiProfile}
        records={aiUsageRecords}
        onSettingsChange={onAiSettingsChange}
        onOpenSettings={onOpenAiSettings}
        onOpenUsage={onOpenAiUsage}
      />
      <GlobalAiAssistCard
        settings={crxSettings}
        activeProfile={activeAiProfile}
        onOpenSettings={onOpenAiSettings}
      />
    </div>

    <div className='library-section section'>
      <div className='library-card-list'>
        {filteredRecords.length === 0 && <div className='business-flow-empty library-empty'>
          暂无匹配的业务流程记录。可以新建流程，或从 JSON 导入已有记录。
        </div>}
        {filteredRecords.map(flow => <FlowRecordCard
          key={flow.flow.id}
          flow={flow}
          selected={flow.flow.id === selectedRecordId}
          onOpen={() => onOpenRecord(flow)}
          onEdit={() => onEditRecord(flow)}
          onDuplicate={() => onDuplicateRecord(flow)}
          onDelete={() => {
            setDeletingFlow(flow);
            setDeleteConfirmed(false);
          }}
        />)}
      </div>
    </div>

    <div className='library-footer footer-actions'>
      <div className='library-save-state footer-status'><span></span>{draftStatus || '流程库已加载'}</div>
      <button type='button' className='primary-button' disabled={records.length === 0} onClick={onExportAll}>导出全部</button>
    </div>

    {deletingFlow && <div className='library-modal-backdrop'>
      <div className='delete-record-modal'>
        <button type='button' className='modal-close' onClick={() => setDeletingFlow(undefined)}>x</button>
        <div className='modal-warning-icon'>!</div>
        <h3>删除业务流程记录？</h3>
        <h4>{deletingFlow.flow.name || '未命名业务流程'}</h4>
        <p>删除后将移除该流程的元数据、步骤、断言和草稿，已导出的 JSON/YAML 文件不会受影响。</p>
        <label className='delete-confirm-check'>
          <input type='checkbox' checked={deleteConfirmed} onChange={e => setDeleteConfirmed(e.target.checked)} />
          我确认删除这个业务流程记录
        </label>
        <div className='modal-actions'>
          <button type='button' onClick={() => setDeletingFlow(undefined)}>取消</button>
          <button
            type='button'
            className='danger'
            disabled={!deleteConfirmed}
            onClick={() => {
              onDeleteRecord(deletingFlow);
              setLastDeletedFlow(deletingFlow);
              setDeletingFlow(undefined);
            }}
          >删除记录</button>
        </div>
      </div>
    </div>}

    {lastDeletedFlow && <div className='library-toast'>
      <span></span>
      已删除：{lastDeletedFlow.flow.name || '未命名业务流程'}
      <button type='button' onClick={() => {
        onRestoreRecord(lastDeletedFlow);
        setLastDeletedFlow(undefined);
      }}>撤销</button>
      <button type='button' onClick={() => setLastDeletedFlow(undefined)}>x</button>
    </div>}
  </div>;
};

const FilterButton: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => <button type='button' className={active ? 'selected' : ''} onClick={onClick}>{children}</button>;

const FlowRecordCard: React.FC<{
  flow: BusinessFlow;
  selected: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ flow, selected, onOpen, onEdit, onDuplicate, onDelete }) => {
  const stats = flowStats(flow);
  const highPriority = flow.flow.priority === 'P0' || flow.flow.priority === 'P1';
  const version = versionState(flow, stats);

  return <article className={selected ? 'library-card record-card selected' : 'library-card record-card'}>
    <div className='record-card-head library-card-title'>
      <div>
        <strong className='record-title'>{flow.flow.name || '未命名业务流程'}</strong>
        <span>business-flow/v1 · {stats.stepCount} 步骤 · 更新于 {formatDateTime(flow.updatedAt)}</span>
      </div>
      <div className='record-badges'>
        {highPriority && <span className='priority-badge pill warn'>高优先级</span>}
        <span className={version.className}>{version.label}</span>
      </div>
    </div>

    <div className='record-status-line'>
      <span>{recentStatus(flow, stats)}</span>
      <span>{[flow.flow.app, flow.flow.module, flow.flow.role].filter(Boolean).join(' · ') || '未填写业务上下文'}</span>
    </div>

    <div className='record-actions library-card-actions'>
      <button type='button' className='primary-button' onClick={onOpen}>打开</button>
      <button type='button' className='mini-button' onClick={onEdit}>编辑</button>
      <button type='button' className='mini-button' onClick={onDuplicate}>复制</button>
      <button type='button' className='mini-button danger danger-button' onClick={onDelete}>删除</button>
    </div>
  </article>;
};

function matchesFilter(flow: BusinessFlow, filter: FlowLibraryFilter) {
  const stats = flowStats(flow);
  if (filter === 'draft')
    return stats.stepCount === 0 || stats.missingAssertionCount > 0;
  if (filter === 'done')
    return stats.stepCount > 0 && stats.missingAssertionCount === 0;
  if (filter === 'high')
    return flow.flow.priority === 'P0' || flow.flow.priority === 'P1';
  return true;
}

function versionState(flow: BusinessFlow, stats: ReturnType<typeof flowStats>) {
  if (!stats.stepCount)
    return { label: '未录制', className: 'status-badge pill' };
  if (stats.missingAssertionCount)
    return { label: `${stats.missingAssertionCount} 个待补`, className: 'status-badge pill warn' };
  if (flow.steps.some(step => step.artifacts?.aiAssist))
    return { label: '推荐版本', className: 'status-badge pill ok' };
  return { label: '可回放', className: 'status-badge pill ok' };
}

function recentStatus(flow: BusinessFlow, stats: ReturnType<typeof flowStats>) {
  if (!stats.stepCount)
    return '还没有录制步骤，可以进入流程后开始录制。';
  if (stats.missingAssertionCount)
    return `已有 ${stats.stepCount} 个步骤，仍有 ${stats.missingAssertionCount} 个步骤缺少断言。`;
  return `已有 ${stats.stepCount} 个步骤和 ${stats.assertionCount} 个断言，可进入回放验证。`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return value;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
