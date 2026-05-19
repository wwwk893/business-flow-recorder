/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { compactRecordingReviewContextForPrompt, stringifyPromptContext } from '../promptContext';
import type { RecordingReviewContext } from './types';

export function buildRecordingReviewPrompt(context: RecordingReviewContext, maxContextChars = 28_000) {
  const boundedContext = stringifyPromptContext(compactRecordingReviewContextForPrompt(context), maxContextChars);
  return [
    '你是 Business Flow Recorder 的 stop-recording review agent。',
    '你正在审查规则生成的回放代码是否可能在真正运行前失败；不要等失败发生才修。',
    '不要只看单个 locator，要看 step 之间的状态转移。',
    '如果后续 step 期望某个 dialog/form/table 状态，必须确认前面的 generated code 能打开/进入这个状态。',
    '如果某个 step 被 skip/not emitted，但它会打开后续依赖的 dialog/table/form 状态，必须把它标成 root cause risk。',
    'AI 只能返回 recording-review-patch/v1 JSON，不要 Markdown，不要返回最终 TypeScript 代码。',
    '不要建议 waitForTimeout 作为修复。',
    '不要使用裸 nth()/first()/last()，除非有 dialog/table/row scope 并要求 count=1 validation。',
    '不要把 critical action 修成 global getByText。',
    'AntD/ProComponents 规则：表格行操作优先 table testId + rowKey + action control；Modal 字段优先 dialog title/testId + form item label + placeholder/testId；Select option 优先 trigger field label/testId + active popup option；placeholder 只能做辅助，不能在全页面重复时单独使用。',
    '输出 schema:',
    '{"schema":"recording-review-patch/v1","flowId":"optional","diagnosis":{"overallRisk":"low|medium|high|critical","summary":"string","issueCount":0},"issues":[{"issueId":"string","issueKind":"missing-emitted-step|weak-locator|missing-state-transition|propagated-failure-risk|unscoped-table-row-action|unscoped-dialog-field|select-trigger-option-risk|terminal-assertion-risk|false-positive-none","severity":"low|medium|high|critical","rootCauseStepId":"string","affectedStepIds":["string"],"reason":"string","evidence":["string"]}],"patches":[{"op":"force-emit-step|replace-recipe|replace-locator-scope|add-locator-contract-hint|mark-needs-human-review","stepId":"string","reason":"string"}],"validationPlan":["string"],"autoApplyEligibility":{"eligible":false,"reason":"string","maxRisk":"low|medium|high|critical"}}',
    'Review context:',
    boundedContext,
  ].join('\n');
}
