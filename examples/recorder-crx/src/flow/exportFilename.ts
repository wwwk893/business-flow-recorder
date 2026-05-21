/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */
import { safeFilename } from './download';
import type { BusinessFlow } from './types';

export function exportDraftFilenameBase(flow: BusinessFlow) {
  return safeFilename(`draft-${exportDraftTitle(flow)}`, 'draft-business-flow');
}

export function exportDraftTitle(flow: BusinessFlow) {
  const flowName = flow.flow.name.trim();
  if (flowName && !isGeneratedDraftFlowName(flowName))
    return flowName;

  const metadataTitle = titleFromParts([flow.flow.module, flow.flow.page]) || titleFromParts([flow.flow.page, flow.flow.module]) || cleanTitlePart(flow.flow.app);
  if (metadataTitle)
    return metadataTitle;

  const contextTitle = titleFromRecordedContext(flow);
  if (contextTitle)
    return contextTitle;

  return 'business-flow';
}

export function isGeneratedDraftFlowName(value: string) {
  const trimmed = value.trim();
  return /^\d{10,}$/.test(trimmed) || /^draft-\d{10,}$/i.test(trimmed);
}

function titleFromRecordedContext(flow: BusinessFlow) {
  for (const step of flow.steps) {
    const before = step.context?.before;
    const after = step.context?.after;
    const breadcrumbTitle = titleFromParts([...(before?.breadcrumb ?? []), before?.activeTab?.title]);
    if (breadcrumbTitle)
      return breadcrumbTitle;
    const afterBreadcrumbTitle = titleFromParts([...(after?.breadcrumb ?? []), after?.activeTab?.title]);
    if (afterBreadcrumbTitle)
      return afterBreadcrumbTitle;
    const scopeTitle = titleFromParts([
      before?.section?.title,
      before?.table?.title,
      before?.form?.title,
      before?.dialog?.title,
      before?.activeTab?.title,
    ]);
    if (scopeTitle)
      return scopeTitle;
    const afterScopeTitle = titleFromParts([
      after?.dialog?.title,
      after?.openedDialog?.title,
      after?.activeTab?.title,
    ]);
    if (afterScopeTitle)
      return afterScopeTitle;
  }
  return undefined;
}

function titleFromParts(parts: Array<string | undefined>) {
  const seen = new Set<string>();
  const cleanParts = parts
      .map(cleanTitlePart)
      .filter((part): part is string => !!part)
      .filter(part => {
        if (seen.has(part))
          return false;
        seen.add(part);
        return true;
      });
  return cleanParts.join('-') || undefined;
}

function cleanTitlePart(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed || isGeneratedDraftFlowName(trimmed))
    return undefined;
  if (/^https?:\/\//i.test(trimmed))
    return undefined;
  return trimmed;
}
