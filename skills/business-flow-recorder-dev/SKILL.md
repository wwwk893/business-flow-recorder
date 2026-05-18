---
name: business-flow-recorder-dev
description: Repository-specific development workflow for any checkout of the Business Flow Recorder repository or compatible fork. Use when Codex works on this repo's recorder/replay architecture, PR review follow-up, GitHub checks, generated replay failures, AntD/ProComponents locator issues, BusinessFlow artifacts, README/repo positioning, issue hygiene, or L1/L2/L3 validation before submitting or merging PRs.
---

# Business Flow Recorder Dev

Use this skill as the repo runbook for any local checkout of Business Flow
Recorder. Do not assume a fixed machine path, owner account, or clone
directory. Derive the repository root, remote, and current branch from the
workspace at runtime.

## First Moves

1. Confirm the repo root, branch, and remote dynamically:

   ```bash
   REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
   cd "$REPO_ROOT"
   git status --short --branch
   git remote -v
   ```

2. Verify this is a Business Flow Recorder-style checkout by checking repo
   anchors, not by matching an absolute path:

   ```text
   README.md
   package.json with test:crx:business-flow:* scripts
   examples/recorder-crx/
   docs/architecture/RECORDER_REPLAY_ARCHITECTURE.md
   tests/crx/TEST_LAYERING.md
   ```

3. Preserve user work. Do not stage unrelated untracked files such as local
   zips, generated test-results folders, or process-doc drafts unless the user
   explicitly asks for them.

4. Read current repo instructions before architecture or replay work:

   ```text
   AGENTS.md
   README.md
   docs/architecture/RECORDER_REPLAY_ARCHITECTURE.md
   tests/crx/TEST_LAYERING.md
   docs/harness/README.md
   docs/checklists/REVIEW_CHECKLIST.md
   ```

5. For post-migration planning, also inspect:

   ```text
   docs/mvp-0.1x-architecture-migration/ARCHITECTURE_CONTRACT.md
   docs/baglc-locator-contract-plan.md
   ```

   If a listed path is missing, search with `rg --files` and use the nearest
   current equivalent.

## Decision Workflow

Classify the task before editing:

- **Read-only PR/status/review**: gather GitHub truth, docs, current head, CI,
  and changed files. Do not edit unless the user asks to fix.
- **Replay/locator bug**: reproduce from attached `business-flow.json`,
  `compact-flow.yaml`, generated replay, or failing CRX artifact before changing
  code.
- **Product fix**: keep the change issue-scoped and protect architecture
  invariants.
- **Docs/repo positioning**: prefer docs-only PRs; do not rename packages,
  imports, extension names, or repo slugs unless explicitly confirmed.
- **Merge/PR delivery**: verify local gates, push, create/update draft PR, then
  watch GitHub checks until pass/fail is known.

## Architecture Guardrails

Keep the layered model intact:

```text
Raw recorder actions / page context facts
  -> Event Journal
  -> interaction transactions
  -> BusinessFlow projection
  -> UiActionRecipe
  -> exported Playwright renderer
  -> parser-safe playback renderer
  -> narrow runtime bridge only when declared by recipe
```

Rules:

- Treat raw recorder actions and page-context events as facts, not business
  steps.
- Put transaction composition in `examples/recorder-crx/src/interactions/`.
- Put projection/finalization/export behavior in
  `examples/recorder-crx/src/flow/`.
- Put AntD/ProComponents semantics in
  `examples/recorder-crx/src/uiSemantics/`.
- Put replay emission in `examples/recorder-crx/src/replay/`.
- Keep `flowBuilder.ts`, `codePreview.ts`, and `replay/index.ts` as facades.
- Do not add business semantics, global text fallback, or selector
  self-healing to `src/server/*`.
- If parser-safe replay needs behavior Playwright parser cannot express, add a
  declared recipe `runtimeFallback` and a narrow tested runtime bridge.

For detailed contracts and common bug patterns, read
`references/replay-contracts.md`.

## Triage and Evidence

For generated replay failures, inspect evidence in this order:

1. User-attached `*.business-flow.json` / `*.compact-flow.yaml`.
2. `tests/.raw-generated-replay/*/generated-replay.spec.ts`.
3. `raw-replay-output.txt`, `replay-failure-diagnostics.json`, trace/video.
4. The exact failing generated locator/action and the terminal business state.
5. Source modules only after the generated artifact shows the wrong shape.

Do not treat `browserContext.close: ENOENT`, trace zip cleanup, or artifact
cleanup failures as the root cause until the actual replay failure is located.

For a more detailed triage path, read `references/replay-triage.md`.

## Validation Gates

Minimum local checks by scope:

- **Docs-only**:

  ```bash
  git diff --check
  ```

  Add L1 when docs describe architecture, validation, or repo process.

- **Flow/projection/recipe/codegen**:

  ```bash
  git diff --check
  npm run test:crx:business-flow:l1
  ```

- **Recorder/parser/player/replay/runtime bridge**:

  ```bash
  git diff --check
  npm run build:crx
  npm run build:examples:recorder
  npm run build:tests
  npm run test:crx:business-flow:l1
  npm run test:crx:business-flow:l2 -- --reporter=line --global-timeout=1200000
  npm run test:crx:business-flow:l3 -- --reporter=line --global-timeout=1200000
  ```

The user has repeatedly required local L1/L2/L3 green before PR submission for
product fixes. Treat that as a hard gate unless they explicitly waive it.

If `build:crx` runs out of memory, look for stale local dev servers or idle
Playwright/Chromium processes before changing code.

After pushing a PR, run:

```bash
gh pr view <number> --json state,isDraft,mergeable,headRefName,url
gh pr checks <number> --watch --interval 10
```

Do not report a PR as complete if GitHub checks are still pending or failed.

## PR and Issue Hygiene

- Use a focused branch. In Codex App, prefer the `codex/` prefix unless the user
  asks otherwise.
- Keep PR scope tight and describe validation precisely.
- If accepting known non-blocking risk, create or link a follow-up issue with:
  problem statement, affected layer, repro/evidence, acceptance criteria, and
  required L1/L2/L3 validation.
- For review feedback, fix the requested P1/P2 items first; do not sneak in
  broad refactors.
- When merging or renaming repo metadata, update local `origin` and verify with
  `gh repo view` / `git remote -v`.
- Do not write concrete machine paths, environment-specific paths, or personal
  clone locations into skills, docs, PR bodies, or durable examples. Use
  `<repo-root>`, `<owner>/<repo>`, or commands that derive paths dynamically.

Read `references/pr-delivery.md` for branch, PR, CI, and merge steps.

## Common Development Invariants

- Preserve exact locator identity. Do not widen recorded
  `getByRole(... exact: true)` or `internal:role=...s` to broad `{ name }`.
- Prefer stronger structured scope over preserved global source: dialog,
  section, table, semantic ancestor, row identity.
- For ProComponents fields, input value comes from the fill action; field
  identity comes from page-context focus/input evidence.
- Do not treat field wrapper test ids as actual input test ids without control
  evidence.
- For AntD readonly Select, do not fill readonly search inputs. Use active
  popup option replay only with AntD/ProComponents popup evidence.
- Contextless option clicks may inherit an active select field only when trigger
  ownership and popup/option evidence line up.
- Row delete openers are not deletion commits. Do not emit row-not-exists until
  confirm/synth-confirm evidence exists.
- Duplicate test ids should use semantic ancestor scope or row identity, not
  bare global nth unless no better evidence exists.
- Terminal assertions must prove business state, not merely script completion.

## Output Style

For this repo, final summaries should clearly separate:

```text
Changed files
What changed
Validation
GitHub PR/check status
Known risk / follow-up
```

When the user asks for an explanation, explain in business-flow terms first,
then map to source modules and generated replay.
