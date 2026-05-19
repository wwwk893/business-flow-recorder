/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

const sensitiveKeyPattern = /(password|passwd|pwd|token|cookie|authorization|auth|secret|api[-_]?key|localStorage|sessionStorage|storageState)/i;
const dropKeyPattern = /^(dom|html|outerHTML|innerHTML|cookie|cookies|localStorage|sessionStorage|storageState|responseBody|fullDom|screenshot|trace)$/i;
const jwtPattern = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const apiKeyPattern = /\b(?:sk|rk|pk|ak)-[A-Za-z0-9][A-Za-z0-9_-]{10,}\b/g;
const bearerPattern = /bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const querySecretPattern = /([?&](?:token|access_token|auth|authorization|session|secret|api_key|apikey)=)[^&#]+/gi;
const longOpaquePattern = /\b[A-Za-z0-9+/=_-]{96,}\b/g;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /\b(?:\+?86[- ]?)?1[3-9]\d{9}\b/g;

export interface AiAssistRedactionResult<T> {
  value: T;
  notes: string[];
}

export function redactAiAssistText(value: string, maxLength = 20_000): string {
  return value
      .replace(jwtPattern, '***token***')
      .replace(apiKeyPattern, '***api-key***')
      .replace(bearerPattern, 'Bearer ***token***')
      .replace(querySecretPattern, '$1***token***')
      .replace(longOpaquePattern, '***token***')
      .replace(emailPattern, '***email***')
      .replace(phonePattern, '***phone***')
      .slice(0, maxLength);
}

export function redactAiAssistValue<T>(value: T, options: { maxStringLength?: number } = {}): AiAssistRedactionResult<T> {
  const notes = new Set<string>();
  const redacted = redactValue(value, '', notes, options.maxStringLength ?? 2000) as T;
  return {
    value: redacted,
    notes: [...notes].sort(),
  };
}

export function redactAiAssistContext<T>(value: T): AiAssistRedactionResult<T> {
  return redactAiAssistValue(value, { maxStringLength: 4000 });
}

function redactValue(value: unknown, key: string, notes: Set<string>, maxStringLength: number): unknown {
  if (dropKeyPattern.test(key)) {
    notes.add(`dropped:${key}`);
    return undefined;
  }
  if (sensitiveKeyPattern.test(key)) {
    notes.add(`masked:${key}`);
    return '***';
  }
  if (typeof value === 'string') {
    const redacted = redactAiAssistText(value, maxStringLength);
    if (redacted !== value)
      notes.add('masked:string');
    return redacted;
  }
  if (Array.isArray(value))
    return value.map(item => redactValue(item, '', notes, maxStringLength)).filter(item => item !== undefined);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const redacted = redactValue(childValue, childKey, notes, maxStringLength);
      if (redacted !== undefined && redacted !== '')
        result[childKey] = redacted;
    }
    return result;
  }
  return value;
}
