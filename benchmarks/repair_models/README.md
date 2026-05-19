# Replay Repair Model Benchmark

This benchmark compares model quality and speed on Business Flow Recorder replay repair tasks.
It does not change production replay behavior.

The cases focus on failures where a generated replay times out or clicks the wrong target, but
the repair model must decide whether the symptom step itself is wrong or whether an earlier
missing/wrong/skipped step caused a propagated failure.

## What It Measures

- whether the model identifies the true root cause step;
- whether it distinguishes current-step locator failures from propagated failures;
- whether it returns strict `replay-repair-patch/v1` JSON;
- whether it avoids unsafe locators such as bare `nth()`, global text, global placeholder, long CSS, XPath, or force click for critical actions;
- whether it provides a validation plan that can be checked by deterministic tooling;
- elapsed time and estimated cost using the shared agent model catalog.

## Commands

```bash
python3 -m unittest benchmarks.repair_models.test_repair_model_benchmark -v
npm run test:repair-benchmark
npm run benchmark:repair-agents -- --dry-run
npm run benchmark:repair-agents -- --models deepseek-v4-flash-no-thinking,deepseek-v4-pro-thinking-high --context-ratios 0.35,0.6,1.0 --no-raw
```

## CLI

```bash
python3 ./benchmarks/repair_models/repair_model_benchmark.py \
  --models gpt-5.4-mini,kimi-k2.5,deepseek-v4-flash-no-thinking \
  --context-ratios 0.35,0.6,1.0 \
  --output benchmarks/repair_models/results/latest.json
```

Supported arguments:

- `--case`: run one case file;
- `--cases`: comma-separated case files;
- `--models`: comma-separated model ids from `benchmarks/agent_models/agent_model_benchmark.py`;
- `--context-ratios`: comma-separated context budgets;
- `--max-context-chars`: max prompt context before ratio trimming;
- `--timeout`: per-model call timeout;
- `--env-file`: optional local env file for provider keys;
- `--dry-run`: do not call external models;
- `--no-raw`: do not store raw model output;
- `--output`: output JSON file.

## Output Shape

The output JSON contains:

- `generated_at`
- `cases`
- `models`
- `runs`
- `summary.ranked`
- `summary.by_case`

Each run records model id, case name, context ratio, success flag, elapsed seconds, prompt/output
chars, estimated tokens, estimated cost, parsed output, score, and error.

## Patch Contract

Models must return strict JSON:

```json
{
  "schema": "replay-repair-patch/v1",
  "caseId": "string",
  "diagnosis": {
    "failureKind": "current-step-locator | propagated-missing-step | propagated-wrong-step | propagated-skipped-step | extra-step-state-drift | assertion-obsolete | application-behavior-change | unsafe-repair-rejected",
    "symptomStepId": "string",
    "rootCauseStepId": "string",
    "confidence": 0.0,
    "reason": "string"
  },
  "patches": [
    {
      "op": "insert-step | unskip-step | replace-recipe | replace-locator | replace-locator-scope | delete-step | add-assertion | update-assertion",
      "stepId": "string",
      "insertBeforeStepId": "string optional",
      "insertAfterStepId": "string optional",
      "recipe": "object optional",
      "locator": "object optional",
      "scope": "object optional",
      "reason": "string"
    }
  ],
  "validationPlan": [
    "string"
  ],
  "risk": {
    "level": "low | medium | high",
    "unsafePatterns": ["string"],
    "notes": "string"
  }
}
```

## Case Notes

`lan_missing_edit_step_propagated_failure.json` is the key propagated-failure case. The visible
timeout happens at `s009`, but the root cause is `s007`: the LAN row edit action was skipped, so
the expected `编辑LAN1` dialog never opened. A model that only replaces the `s009` placeholder
locator should score poorly.

`critical_row_action_without_rowkey_negative.json` is a safety case. A model should reject unsafe
global text or ordinal delete locators when no row key or stable row identity exists.
