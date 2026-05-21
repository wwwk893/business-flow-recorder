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
 */
import type { FlowActionType, FlowStep } from './types';
import type { PageContextEvent } from './pageContextTypes';

const beforeWindowMs = 300;
const afterWindowMs = 800;
const exactTestIdFallbackWindowMs = 5000;

export function matchPageContextEvent(step: FlowStep, events: PageContextEvent[]): PageContextEvent | undefined {
  const timing = actionTiming(step.rawAction);
  if (!timing)
    return undefined;

  const compatibleEvents = events.filter(event => isCompatible(step.action, event.kind));
  const windowStart = timing.start - beforeWindowMs;
  const windowEnd = timing.end + afterWindowMs;
  const targetTestId = stepTestIdEvidence(step);
  const primaryCandidates = compatibleEvents.filter(event => {
    const eventTime = timing.clock === 'wall' ? event.wallTime : event.time;
    return eventTime !== undefined && eventTime >= windowStart && eventTime <= windowEnd;
  });
  const exactFallback = exactTestIdFallbackCandidates(step, compatibleEvents, timing, targetTestId);
  const candidates = mergeCandidateEvents(primaryCandidates, exactFallback);
  if (!candidates.length)
    return undefined;

  const scored = candidates
      .map(event => ({ event, score: candidateScore(step, event) }))
      .filter(candidate => candidate.score >= 0);
  if (!scored.length)
    return undefined;

  return scored.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff)
      return scoreDiff;
    return Math.abs(eventTimeFor(a.event, timing.clock) - timing.end) - Math.abs(eventTimeFor(b.event, timing.clock) - timing.end);
  })[0].event;
}

function mergeCandidateEvents(...groups: PageContextEvent[][]) {
  const seen = new Set<string>();
  const merged: PageContextEvent[] = [];
  for (const group of groups) {
    for (const event of group) {
      if (seen.has(event.id))
        continue;
      seen.add(event.id);
      merged.push(event);
    }
  }
  return merged;
}

function exactTestIdFallbackCandidates(step: FlowStep, events: PageContextEvent[], timing: NonNullable<ReturnType<typeof actionTiming>>, targetTestId?: string) {
  if (!targetTestId)
    return [];
  return events.filter(event => {
    if (event.before.target?.testId !== targetTestId)
      return false;
    const eventTime = eventTimeFor(event, timing.clock);
    if (eventTime === undefined)
      return false;
    return Math.abs(eventTime - timing.end) <= exactTestIdFallbackWindowMs;
  });
}

function candidateScore(step: FlowStep, event: PageContextEvent) {
  const target = step.target;
  const contextTarget = event.before.target;
  if (!target || !contextTarget)
    return 0;

  const targetTestId = stepTestIdEvidence(step);
  const contextTestId = contextTarget.testId;
  if (targetTestId && contextTestId)
    return targetTestId === contextTestId ? 200 : -1;

  const stepText = normalizeComparable(target.displayName || target.name || target.text || target.label || target.placeholder);
  const contextText = normalizeComparable(contextTarget.text || contextTarget.ariaLabel || contextTarget.title || contextTarget.placeholder || event.before.form?.label);
  const labelText = normalizeComparable(target.label || target.scope?.form?.label);
  const formLabel = normalizeComparable(event.before.form?.label);

  const targetSemantic = normalizeComparable(target.label || target.name || target.displayName || target.placeholder || target.text);
  if ((step.action === 'fill' || step.action === 'select') && targetSemantic && formLabel && targetSemantic !== formLabel && targetSemantic !== contextText)
    return -1;

  let score = 0;
  if (targetTestId && !contextTestId)
    score += 20;
  if (stepText && contextText && stepText === contextText)
    score += 120;
  if (labelText && formLabel && labelText === formLabel)
    score += 100;
  if (target.role && contextTarget.role && target.role === contextTarget.role)
    score += 40;
  if (event.before.table?.rowKey)
    score += 80;
  if (event.kind === 'input' || event.kind === 'change')
    score += step.action === 'fill' || step.action === 'select' || step.action === 'check' || step.action === 'uncheck' ? 30 : 0;

  const clearTextMismatch = stepText && contextText && stepText !== contextText;
  const clearLabelMismatch = labelText && formLabel && labelText !== formLabel;
  if (!score && (clearTextMismatch || clearLabelMismatch))
    return -1;
  if (clearTextMismatch && score <= 10)
    return -1;
  if (step.action === 'fill' && event.kind === 'click' && (clearTextMismatch || (targetTestId && contextTestId && targetTestId !== contextTestId)))
    return -1;
  return score;
}

function stepTestIdEvidence(step: FlowStep) {
  return step.target?.testId ||
    testIdFromSelector(step.target?.selector) ||
    testIdFromSelector(step.target?.locator) ||
    testIdFromSelector(stringValue((step.target?.raw as { selector?: unknown } | undefined)?.selector)) ||
    testIdFromSelector(JSON.stringify(step.target?.raw)) ||
    testIdFromRawAction(step.rawAction) ||
    testIdFromSourceCode(step.sourceCode) ||
    testIdFromTargetText(step.target?.displayName) ||
    testIdFromTargetText(step.target?.name) ||
    testIdFromTargetText(step.target?.text);
}

function testIdFromRawAction(rawAction: unknown) {
  const record = rawAction && typeof rawAction === 'object' ? rawAction as Record<string, unknown> : undefined;
  const nestedAction = record?.action && typeof record.action === 'object' ? record.action as Record<string, unknown> : undefined;
  return testIdFromSelector(stringValue(nestedAction?.selector) || stringValue(record?.selector));
}

function testIdFromSourceCode(sourceCode?: string) {
  return sourceCode?.match(/getByTestId\(["']([^"']+)["']\)/)?.[1] ||
    testIdFromSelector(sourceCode);
}

function testIdFromSelector(selector?: string) {
  if (!selector)
    return undefined;
  const source = selector.replace(/\\(["'])/g, '$1');
  return source.match(/internal:testid=\[data-testid=["']([^"']+)/)?.[1] ||
    source.match(/data-testid=["']([^"']+)/)?.[1] ||
    source.match(/\[data-testid=["']([^"']+)/)?.[1];
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function testIdFromTargetText(value?: string) {
  const match = value?.replace(/\s+/g, ' ').trim().match(/^testId\s+([A-Za-z0-9_-]+)$/i);
  return match?.[1];
}

function normalizeComparable(value?: string) {
  return value?.replace(/^\s*\*\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function actionTiming(rawAction: unknown) {
  const record = rawAction && typeof rawAction === 'object' ? rawAction as Record<string, unknown> : undefined;
  const wallStart = typeof record?.wallTime === 'number' ? record.wallTime : undefined;
  const wallEnd = typeof record?.endWallTime === 'number' ? record.endWallTime : wallStart;
  if (wallStart !== undefined && wallEnd !== undefined)
    return { start: wallStart, end: wallEnd, clock: 'wall' as const };

  const start = typeof record?.startTime === 'number' && record.startTime > 0 ? record.startTime : undefined;
  const end = typeof record?.endTime === 'number' && record.endTime > 0 ? record.endTime : start;
  if (start === undefined || end === undefined)
    return undefined;
  return { start, end, clock: 'page' as const };
}

function eventTimeFor(event: PageContextEvent, clock: 'wall' | 'page') {
  return clock === 'wall' ? event.wallTime ?? event.time : event.time;
}

function isCompatible(action: FlowActionType, eventKind: PageContextEvent['kind']) {
  switch (action) {
    case 'click':
      return eventKind === 'click';
    case 'fill':
      return eventKind === 'input' || eventKind === 'change' || eventKind === 'click';
    case 'select':
      return eventKind === 'change' || eventKind === 'click';
    case 'check':
    case 'uncheck':
      return eventKind === 'change' || eventKind === 'click';
    case 'press':
      return eventKind === 'keydown';
    case 'wait':
      return false;
    case 'navigate':
      return eventKind === 'navigation';
    default:
      return eventKind === 'click' || eventKind === 'change' || eventKind === 'input';
  }
}
