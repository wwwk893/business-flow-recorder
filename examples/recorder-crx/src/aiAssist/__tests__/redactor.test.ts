/**
 * Copyright (c) Rui Figueira.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { redactAiAssistContext, redactAiAssistText } from '../redactor';
import { assert } from './testHelpers';
import type { AiAssistTestCase } from './testHelpers';

export const redactorTests: AiAssistTestCase[] = [{
  name: 'AI Assist redactor removes storage/cookies/tokens before provider calls',
  run: () => {
    const redacted = redactAiAssistContext({
      url: 'https://internal.example/app?token=secret-token',
      cookie: 'sid=secret',
      localStorage: { token: 'secret' },
      step: { text: '编辑LAN1', apiKey: 'sk-1234567890abcdef' },
    });
    const text = JSON.stringify(redacted.value);
    assert(!text.includes('secret-token'), 'URL token should be redacted');
    assert(!text.includes('sid=secret'), 'cookie should be dropped');
    assert(!text.includes('localStorage'), 'localStorage should be dropped');
    assert(!text.includes('sk-1234567890abcdef'), 'API key should be masked');
    assert(text.includes('编辑LAN1'), 'business UI text should be preserved');
    assert(redactAiAssistText('Bearer abcdefghijklmnopqrstuvwxyz').includes('Bearer ***token***'), 'bearer token should be masked');
  },
}];
