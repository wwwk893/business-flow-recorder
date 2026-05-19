# Business Flow Recorder

A Chrome extension recorder for turning real user validation sessions into
durable business-flow assets, assertions, and replayable Playwright
verification.

Built on top of `playwright-crx`, this project records realistic browser
interactions, enriches them with page context, projects low-level actions into
stable business steps, and generates replay code that verifies terminal
business states.

Current primary target: React + Ant Design + ProComponents business systems.

It is designed for teams that need regression coverage for fast-changing
frontend applications without asking testers to hand-write every Playwright
test.

## Why

Modern enterprise frontends change quickly. AntD portal dropdowns, virtualized
Select options, ProForm wrappers, ProTable row actions, modals, drawers, and
Popconfirm flows can make traditional record-and-replay scripts fragile.

A raw recorder usually captures browser actions:

```text
click
fill
click option
press
```

Testers and business users think in business steps:

```text
Open the create-user dialog
Fill user information
Select role as Auditor
Confirm creation
Verify the user row exists
```

Business Flow Recorder bridges that gap. It records real tester workflows,
preserves page and business context, lets testers add intent and assertions,
and exports compact artifacts that can be reused for replay, regression,
documentation, AI-assisted test generation, support, and troubleshooting.

## What It Does

The recorder can:

- attach to the current browser tab from a Chrome extension side panel;
- record real user interactions on business pages;
- enrich actions with page context such as modal title, form label, table row,
  current tab, section, semantic ancestor, and AntD popup option;
- compact low-level typing and select interactions into stable business steps;
- let testers edit flow metadata, step intent, comments, and assertions;
- support repeat segments for data-driven business flows;
- export `business-flow.json` and compact YAML;
- generate Playwright replay code;
- run parser-safe playback inside the plugin;
- verify generated replay with terminal-state assertions;
- optionally run plugin-driven AI Review / Repair through a configured
  OpenAI-compatible provider, with structured patch validation;
- store and restore local flow drafts.

## Architecture

```text
Raw recorder actions
  -> capture normalization
  -> Event Journal
  -> interaction transactions
  -> BusinessFlow projection
  -> UiActionRecipe
  -> exported Playwright renderer
  -> parser-safe playback renderer
  -> narrow runtime bridge only when declared by recipe
```

Core invariants:

```text
Raw event is fact.
Transaction is interaction.
FlowStep is business projection.
UiActionRecipe is replay semantics.
Renderer only emits code.
Runtime bridge is narrow and fail-closed.
```

Start here for the operating map:

```text
docs/architecture/RECORDER_REPLAY_ARCHITECTURE.md
examples/recorder-crx/README.md
tests/crx/TEST_LAYERING.md
docs/harness/README.md
docs/ai-assist-review-repair-hermes-guide.md
```

## Business Flow Artifacts

A recorded business flow contains:

- flow metadata: name, repo, module, page, role, priority, business goal,
  preconditions, test data, and tags;
- stable business steps;
- target context: test id, role, label, table row, dialog, section, form item,
  option text, and semantic ancestor;
- tester-authored intent and comments;
- assertions;
- repeat segments;
- replay artifacts;
- redacted diagnostics.

The exported artifacts are intended to be compact, reviewable, deterministic,
and safe to share internally.

## AntD / ProComponents Support

The recorder is optimized for real AntD and ProComponents pages, including:

- AntD Select / TreeSelect / Cascader portal dropdowns;
- virtualized option DOM;
- ProForm fields and wrappers;
- Modal / Drawer / Popconfirm;
- ProTable row actions;
- repeated `data-testid` targets;
- readonly Select inputs;
- hidden overlay containers;
- generated replay terminal verification.

The goal is not to blindly click whatever matches. The replay system prefers
stable evidence and fails closed when an action would be ambiguous.

## Replay Safety

Generated replay must prove business success, not just script completion.

Examples of terminal-state verification:

- created row exists;
- deleted row no longer exists;
- modal is closed;
- selected value is visible;
- required fields were filled before save;
- repeat rows produce the expected table state.

Runtime fallback is intentionally narrow. `CrxPlayer` is only allowed to bridge
explicitly generated parser-safe actions, such as active AntD popup option
dispatch or duplicate ordinal clicks. It must not perform global text fallback,
open all selects, or infer business semantics.

## Test Layers

```bash
npm run test:crx:business-flow:l1
npm run test:crx:business-flow:l2 -- --reporter=line --global-timeout=1200000
npm run test:crx:business-flow:l3 -- --reporter=line --global-timeout=1200000
```

Layer guide:

```text
L1: pure flow / transaction / projection / recipe / codegen contracts
L2: deterministic CRX generated replay with terminal-state assertions
L3: human-like mouse/keyboard smoke paths
```

The aggregate command remains available:

```bash
npm run test:crx:business-flow -- --reporter=line --global-timeout=1200000
```

For replay failures, inspect generated artifacts first:

```text
tests/.raw-generated-replay/
tests/test-results/
tests/playwright-report/
```

## Build

```bash
npm ci
npm run build:crx
npm run build:examples:recorder
npm run build:tests
```

Use this order when recorder, parser, player, runtime bridge, or replay code
changes. The example extension and CRX tests can depend on both root `lib/`
output and `examples/recorder-crx/dist`.

The historical full build remains:

```bash
npm run build
```

## Privacy and Redaction

Do not collect or export:

- cookies;
- authorization headers;
- tokens;
- passwords;
- full DOM snapshots;
- full response bodies;
- private customer data.

Business-flow JSON, compact YAML, and replay diagnostics must stay compact and
redacted.

## Project Boundaries

This project currently focuses on browser-extension business-flow recording,
review, export, and replay verification.

Out of scope for the current recorder MVP:

- Native Messaging runner integration;
- full local Node runner platform;
- CI platform orchestration;
- arbitrary AI-generated Playwright specs that bypass recorder artifacts;
- selector self-healing that bypasses deterministic validation;
- automatic Git or PR creation.

Those can be future layers, but the recorder must first produce stable,
trustworthy business-flow assets.

## Relationship to Playwright CRX

This repository is based on `playwright-crx`, which provides a Chrome extension
implementation of Playwright recorder/player functionality through
`chrome.debugger`.

The business-flow recorder extends that foundation with:

- side-panel business workflow review;
- Event Journal;
- interaction transactions;
- BusinessFlow projection;
- UiActionRecipe;
- replay compiler;
- AntD / ProComponents semantic handling;
- terminal-state verification;
- L1/L2/L3 regression harness.

The upstream-style `playwright-crx` library API, TodoMVC example, Chrome
extension recorder/player foundation, and Playwright subtree remain in this
repository. Keep upstream compatibility changes separate from business-flow
recorder changes.

This project is not affiliated with Microsoft Playwright.

## Playwright CRX Foundation

The foundation layer relies on
[`chrome.debugger`](https://developer.chrome.com/docs/extensions/reference/debugger/)
to implement Playwright's `ConnectionTransport` interface inside a Chrome
extension.

If you only need ordinary end-to-end tests, use
[`@playwright/test`](https://playwright.dev/docs/intro). Use this repository
when you need extension-based recording, parser-safe playback, or durable
business-flow assets.

The upstream-style examples are still useful when working on the CRX foundation:

```text
examples/todomvc-crx
```

To update the nested Playwright subtree:

```bash
git subtree pull --prefix=playwright git@github.com:microsoft/playwright.git <release-tag> --squash
```
