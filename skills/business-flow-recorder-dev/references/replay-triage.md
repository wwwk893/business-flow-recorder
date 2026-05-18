# Replay Triage

Load this reference when the user reports a replay timeout, wrong generated
locator, L2/L3 failure, CI failure, or PR review finding involving recorder
replay.

## Evidence Order

1. Read the user-provided artifact:

   ```text
   *.business-flow.json
   *.compact-flow.yaml
   screenshot / replay log / copied Playwright error
   ```

2. Locate generated replay artifacts:

   ```text
   tests/.raw-generated-replay/
   tests/test-results/
   tests/playwright-report/
   ```

3. Open the generated spec first:

   ```text
   generated-replay.spec.ts
   raw-replay-output.txt
   replay-failure-diagnostics.json
   ```

4. Identify the exact wrong action:

   ```text
   action kind
   generated locator
   expected business target
   actual intercepted/timeout target
   terminal assertion status
   ```

5. Only then edit source modules.

## Common Failure Shapes

### Readonly AntD Select fill timeout

Symptom:

```text
fill("WAN1")
element is not editable
<input readonly role="combobox" ...>
```

Likely cause:

```text
generated replay treats AntD readonly select search input as fillable textbox
```

Fix direction:

```text
select trigger/search/option should become select transaction or active popup
option replay, not ordinary fill
```

### Option click intercepted inside modal

Symptom:

```text
page.locator('div').filter({ hasText: /^HTTP: 80$/ }).nth(1).click()
modal wrapper or row intercepts pointer events
```

Likely cause:

```text
contextless option text replay lost ownership of the previously opened select
and fell back to page-level div text
```

Fix direction:

```text
inherit active dropdown/select field context only from a nearby valid trigger;
emit active popup option replay scoped to the popup
```

### Generated assertion fails before commit

Symptom:

```text
row-not-exists fails immediately after delete opener
```

Likely cause:

```text
effect hint treated opener as confirmed delete
```

Fix direction:

```text
gate disappearance on confirm/synth-confirm/after commit evidence
```

### Exact role widened

Symptom:

```text
recorded: getByRole(... exact: true)
generated: getByRole(... { name })
runtime: internal:role=...i
```

Likely cause:

```text
fallback renderer ignored recorded exact identity
```

Fix direction:

```text
preserve exact evidence or regenerate scoped exact locator
```

### Range field start/end merge

Symptom:

```text
two ProComponents range inputs share a wrapper test id and overwrite each other
```

Likely cause:

```text
ui.targetTestId treated as actual input test id rather than wrapper evidence
```

Fix direction:

```text
compose wrapper + fieldName / placeholder identity
```

## Source Hotspots

Use `rg` first. Common files:

```text
examples/recorder-crx/src/interactions/inputTransactions.ts
examples/recorder-crx/src/interactions/selectTransactions.ts
examples/recorder-crx/src/flow/businessFlowProjection.ts
examples/recorder-crx/src/flow/eventJournal.ts
examples/recorder-crx/src/flow/stepStability.test.ts
examples/recorder-crx/src/replay/stepEmitter.ts
examples/recorder-crx/src/replay/effectiveReplayFlow.ts
examples/recorder-crx/src/replay/terminalAssertions.ts
examples/recorder-crx/src/replay/actionCounter.ts
examples/recorder-crx/src/uiSemantics/recipes.ts
tests/crx/businessFlowRecorder.spec.ts
tests/crx/humanLikeRecorder.spec.ts
tests/crx/player-runtime-bridge.spec.ts
```

## Repro Strategy

Start small:

```bash
npm run test:crx:business-flow:l1
```

For one browser spec:

```bash
xvfb-run -a npx playwright test -c tests/playwright.config.ts <spec> --project=Chrome --workers=1 --reporter=line --global-timeout=1200000
```

For CI-like generated replay behavior:

```bash
CI=1 xvfb-run -a npx playwright test -c tests/playwright.config.ts <spec> --project=Chrome --workers=1 --reporter=line --global-timeout=1200000
```

After a fix, inspect both generated replay shape and terminal business state.
Do not make tests green by deleting assertions, force clicking, dispatching
generic events, adding blind sleeps, or replacing real AntD/ProComponents paths
with mocks.
