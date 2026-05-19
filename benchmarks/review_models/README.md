# Stop Recording Review Model Benchmark

This benchmark compares model quality and speed for **stop-recording AI review** in Business Flow Recorder.

It is intentionally outside production replay behavior. It loads synthetic but realistic review cases, builds a redacted prompt, calls the shared model catalog/provider helpers from `benchmarks.agent_models.agent_model_benchmark`, scores the returned `recording-review-patch/v1` JSON, and writes a JSON report.

## Commands

```bash
python3 -m unittest benchmarks.review_models.test_recording_review_benchmark -v
npm run test:review-benchmark
npm run benchmark:review-agents -- --dry-run
npm run benchmark:review-agents -- --models deepseek-v4-flash-no-thinking,deepseek-v4-pro-thinking-high --context-ratios 0.35,0.6,1.0 --no-raw
```

## What It Measures

- whether the model identifies the root-cause step, not only the suspicious later line;
- whether it distinguishes current-step locator risk from propagated missing/skipped step risk;
- whether it emits strict `recording-review-patch/v1` JSON;
- whether it avoids unsafe locators such as global text, unscoped `nth()`, broad placeholder, XPath, and forced critical clicks;
- whether it gives a deterministic validation plan;
- speed and estimated cost.

## Output

The output JSON includes:

```text
generated_at
cases
models
runs
summary.ranked
summary.by_case
```

By default the latest report is written to:

```text
benchmarks/review_models/results/latest.json
```

Use `--output path/to/report.json` to keep a named run.

## Case Design

Cases are stored under `benchmarks/review_models/cases/`.

The key propagated-risk fixture is `lan_review_missing_row_edit_before_input.json`: step `s007` is the LAN row edit action that should open `编辑LAN1`, but it is not emitted; step `s009` later tries to fill the LAN IP field. A good model should flag `s007` as the root cause and `s009` as affected. A patch that only makes the `s009` placeholder locator more specific is intentionally scored low.

The good-flow fixture controls false positives: a model should be able to return a low-risk no-issue review without inventing patches.
