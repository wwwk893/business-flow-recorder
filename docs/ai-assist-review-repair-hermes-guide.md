# AI Review / Repair Hermes Trial Guide

This guide is for trying the in-plugin AI Review and AI Repair loop from the
Business Flow Recorder extension.

The AI flow is intentionally plugin-driven:

- users do not copy prompts to an external AI tool;
- the extension builds and redacts context;
- the configured provider is called from the plugin;
- the model must return structured JSON patches;
- the plugin validates schema, safety, and renderability before applying.

## What Was Added

### AI Assist Provider

The recorder now has an AI Assist provider layer that can be configured from
the extension settings.

Supported provider modes:

- `disabled`: safe default, no external calls.
- `mock`: local test provider.
- `local`: reserved local endpoint mode.
- `private-http`: private OpenAI-compatible HTTP gateway.
- `cloud-http`: cloud OpenAI-compatible HTTP gateway, only when explicitly
  allowed.

The provider reuses the AI Provider profile details:

- Base URL
- Model
- API Key
- response mode
- timeout
- retry limit

Secrets must be entered in the extension UI or secure local settings. Do not
commit API keys into the repository.

### Stop Recording AI Review

When AI Review is enabled, the stop button changes from:

```text
停止录制
```

to:

```text
停止录制并审查
```

After recording is finalized, the extension can build a
`recording-review-context/v1` package containing:

- flow summary;
- relevant steps;
- emitted code map;
- parser-safe replay snippets;
- review signals;
- locator diagnostics;
- state transitions;
- forbidden repair rules.

The AI returns `recording-review-patch/v1` JSON. The extension validates it and:

- auto-applies low-risk patches only when configured;
- requires manual confirmation for medium/high/critical patches;
- shows the validation result and any failure reason in the UI.

### Replay Failure AI Repair

After replay failure, the UI can show:

```text
AI 修复并重试
```

The extension collects a `replay-repair-context/v1` package containing:

- failure message and failed step;
- failed code/locator when available;
- causal window;
- emitted code map for the window;
- replay trace summary;
- locator diagnostics;
- previous stop-recording review summary, if available.

The AI returns `replay-repair-patch/v1` JSON. The extension validates the patch,
applies it to a temporary flow, refreshes parser-safe code, and triggers a full
replay retry.

Current behavior is **validated patch + full retry requested**. It is not yet a
runtime-acknowledged segment replay.

### Prompt Context Packing

Large flows are compacted before being sent to AI.

Review prompt priority:

1. `reviewSignals`
2. `stateTransitions`
3. `locatorDiagnostics`
4. `generatedArtifacts.emittedCodeMap`
5. parser-safe/exported code excerpts
6. relevant risky steps

Repair prompt priority:

1. failure
2. first divergence
3. causal window
4. previous review summary
5. replay trace
6. emitted code map and steps from the causal window

Oversized context uses middle truncation, so both the front-loaded diagnostics
and tail evidence have a better chance of staying visible.

## Configure Hermes Test Provider

Open extension settings and configure the AI Provider profile first.

Verified profile for the Hermes local proxy / CLIProxyAPI path:

```text
Name: kimi
Protocol: OpenAI-compatible
Base URL: http://130.94.65.103:8317/v1
Model: kimi-k2.6
Response mode: json_object
Thinking: disabled
Temperature: 0.1
Max tokens: 4096
Timeout ms: 180000
```

Enter the API Key in the UI. Do not write it into source files, docs, test
fixtures, or screenshots committed to the repo.

Why these values matter:

- `thinking: enabled` can put useful model output into `reasoning_content` while
  leaving `message.content` empty or incomplete. The plugin reads
  `choices[0].message.content`, so this looks like a JSON parse failure even
  when the provider call succeeded.
- `prompt_json_only` is less reliable on this path than provider-native
  `json_object` mode.
- `max_tokens: 1800` is too small for realistic review patches and can truncate
  otherwise-valid JSON.
- `timeout: 60000` is enough for the small connection probe, but too tight for a
  stop-recording review context.

Click:

```text
Test Connection
```

The connection result should appear under the Provider card. A successful test
only proves the small connection probe works; AI Review can still need a longer
timeout because the review prompt is much larger.

## Enable AI Review / Repair

In the settings page, open the AI Review section.

Suggested first trial settings:

```text
Enable AI Review: on
Review on stop recording: on
Auto apply low-risk review patch: off for the first trial
Show repair-on-failure button: on
Provider kind: private-http
Allow cloud provider: off for private proxy
Max context chars: 8000-12000 for first browser smoke; up to 28000 for larger flows
Timeout ms: 180000 for Kimi 2.6 browser smoke
Retry limit: 0 or 1
```

Use `cloud-http` only when the endpoint is intentionally a cloud provider and
`allowCloudProvider` is explicitly enabled.

## Try Stop Recording Review

1. Open the target business page.
2. Attach the recorder to the page.
3. Record a short business flow.
4. If AI Review is enabled, click:

   ```text
   停止录制并审查
   ```

5. Wait for the AI Review card.
6. Check:

   - risk summary;
   - issue list;
   - root cause step;
   - affected step ids;
   - patch list;
   - validation result.

For propagated failures, a good review should not only patch the failing input
line. It should identify the first missing or skipped upstream step that caused
the later state to be absent.

Example expected reasoning:

```text
s007 row edit opens 编辑LAN1
s009 fill expects 编辑LAN1
s007 was not emitted
root cause is s007, affected step is s009
```

## Try Replay Repair

1. Generate or open replay code from the flow.
2. Run replay until a real runtime failure appears.
3. Click:

   ```text
   AI 修复并重试
   ```

4. The plugin will:

   - collect failure context;
   - include previous AI Review context when available;
   - call the provider;
   - parse structured JSON;
   - validate safety;
   - apply to a temporary flow;
   - refresh replay code;
   - trigger full replay retry.

If the provider, parser, validator, or retry dispatch fails, the UI should show
the failure reason.

## Patch Safety Rules

The model must not output final Playwright code as the answer.

Allowed outputs are structured patches:

- `recording-review-patch/v1`
- `replay-repair-patch/v1`

The validator rejects unsafe patterns such as:

- raw TypeScript code in patch payloads;
- `waitForTimeout` as a repair;
- unscoped global text locators for critical actions;
- unscoped `nth()`, `first()`, or `last()`;
- absolute XPath;
- broad global placeholder repair when recorded context has stronger scope.

Review patch operation requirements:

- `force-emit-step`: requires `stepId` and `reason`.
- `replace-recipe`: requires `recipe`.
- `replace-locator-scope`: requires `scope`.
- `add-locator-contract-hint`: requires `locatorContractHint`.
- `mark-needs-human-review`: requires `stepId` and `reason`.

Repair patch operation requirements:

- `insert-step`: requires `step` plus `insertBeforeStepId` or
  `insertAfterStepId`.
- `replace-recipe`: requires `recipe`.
- `replace-locator`: requires `locator`.
- `replace-locator-scope`: requires `scope`.
- `add-assertion` / `update-assertion`: requires `assertion`.
- `delete-step`: high risk and rejected unless separately confirmed by a human.

## Redaction Behavior

Before provider calls, context is redacted.

The redactor masks or removes:

- cookies;
- localStorage/sessionStorage/storageState;
- authorization values;
- API keys;
- bearer tokens;
- JWT-like tokens;
- URL query secrets;
- URL host/IP values;
- long opaque strings;
- emails and phone numbers.

Business UI text such as `LAN1`, `编辑LAN1`, `WAN口`, and option labels is kept
when possible because it is needed for diagnosis.

## Common Troubleshooting

### Test Connection passes but AI Review fails

The connection probe is small. AI Review sends a larger review prompt.

Try:

```text
Timeout ms: 90000
Max context chars: 18000-28000
Retry limit: 1
```

If the UI shows a timeout/cancel message, the request reached the provider layer
but was aborted by timeout or caller cancellation.

### Provider disabled

Check:

```text
Enable AI Review: on
Provider kind: private-http / local / cloud-http
```

For cloud endpoints, also check:

```text
Allow cloud provider: on
```

### AI returns invalid JSON

The plugin will reject it. Inspect the Review / Repair card failure reason.
Provider profiles should use a JSON-oriented response mode when available.

Recommended for Kimi 2.6 through the Hermes private gateway:

```text
Response mode: json_object
Thinking: disabled
Temperature: 0.1
Max tokens: 4096
```

If the UI reports `AI output did not contain a JSON object`, first check whether
thinking mode is enabled. With some OpenAI-compatible gateways, thinking output
is returned as `reasoning_content`, not `message.content`, and the plugin will
not parse it as the patch payload.

If the UI reports an unterminated string or truncated JSON, increase
`Max tokens` before changing the prompt. The observed lower bound for realistic
review output is `4096`.

### Patch validates but is not auto-applied

This is expected for medium/high/critical patches. The user must click:

```text
确认应用
```

Low-risk patches can be auto-applied only when:

```text
Auto apply low-risk review patch: on
```

## Local Verification Commands

Useful checks for this feature:

```bash
git diff --check
npm run test:crx:business-flow:l1
npm run test:review-benchmark
npm run test:repair-benchmark
npm run build:examples:recorder
npm run build:crx
```

Optional browser-focused smoke:

```bash
PLAYWRIGHT_CRX_HEADLESS=1 npx playwright test -c tests/playwright.config.ts tests/crx/businessFlowRecorder.spec.ts --project=Chrome --grep "shows grouped settings accordion" --reporter=line
```

## Current Limitations

- Repair currently triggers a full replay retry, not a validated segment replay
  with runtime acknowledgement.
- The model can suggest patches, but deterministic validators decide whether a
  patch can be applied.
- High-risk patches are intentionally manual-confirm only.
- AI should assist the recorder; it should not become a selector self-healing
  fallback or a source of arbitrary generated Playwright code.
