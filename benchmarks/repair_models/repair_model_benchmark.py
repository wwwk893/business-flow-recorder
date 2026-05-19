#!/usr/bin/env python3
"""Benchmark model ability to repair Business Flow Recorder replay failures.

This harness is intentionally separate from production replay code. It reuses the
provider/catalog helpers from benchmarks.agent_models.agent_model_benchmark so the
benchmark can compare the same model ids without duplicating provider plumbing.
"""

from __future__ import annotations

import argparse
import json
import math
import socket
import sys
import textwrap
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from benchmarks.agent_models import agent_model_benchmark as agent_bench

DEFAULT_MODEL_IDS = (
    "gpt-5.4-mini",
    "kimi-k2.5",
    "deepseek-v4-flash-no-thinking",
    "deepseek-v4-flash-thinking-high",
    "deepseek-v4-pro-no-thinking",
    "deepseek-v4-pro-thinking-high",
)

DEFAULT_MODELS = agent_bench.DEFAULT_MODELS
redact_secrets = agent_bench.redact_secrets
estimate_tokens = agent_bench.estimate_tokens
parse_json_from_output = agent_bench.parse_json_from_output
model_cost = agent_bench.model_cost
load_env_file = agent_bench.load_env_file
call_model = agent_bench.call_model

FAILURE_KINDS = {
    "current-step-locator",
    "propagated-missing-step",
    "propagated-wrong-step",
    "propagated-skipped-step",
    "extra-step-state-drift",
    "assertion-obsolete",
    "application-behavior-change",
    "unsafe-repair-rejected",
}

PATCH_OPS = {
    "insert-step",
    "unskip-step",
    "replace-recipe",
    "replace-locator",
    "replace-locator-scope",
    "delete-step",
    "add-assertion",
    "update-assertion",
}

RISK_LEVELS = {"low", "medium", "high"}

UNSAFE_LOCATOR_PATTERNS = (
    "getbytext(",
    "getbyplaceholder(",
    ".nth(",
    ".first(",
    ".last(",
    "force: true",
    "locator('div')",
    'locator("div")',
    "xpath",
    "global text",
    "global placeholder",
    "long css",
    "css chain",
)


@dataclass
class RepairRun:
    model_id: str
    case_name: str
    context_ratio: float
    ok: bool
    elapsed_seconds: float
    prompt_chars: int
    output_chars: int
    estimated_prompt_tokens: int
    estimated_output_tokens: int
    estimated_cost_usd: float
    parsed_output: dict[str, Any] | None
    score: dict[str, Any] | None
    error: str | None
    raw_output: str | None = None
    provider_usage: dict[str, Any] | None = None


def _cases_dir() -> Path:
    return Path(__file__).with_name("cases")


def _results_dir() -> Path:
    return Path(__file__).with_name("results")


def _load_case(path: str | Path) -> dict[str, Any]:
    case = json.loads(Path(path).read_text(encoding="utf-8"))
    return _redact_json(case)


def _redact_json(value: Any) -> Any:
    if isinstance(value, str):
        return redact_secrets(value)
    if isinstance(value, list):
        return [_redact_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _redact_json(item) for key, item in value.items()}
    return value


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def _truncate_middle(text: str, target_chars: int) -> str:
    if len(text) <= target_chars:
        return text
    if target_chars <= 240:
        return text[:target_chars]
    head = int(target_chars * 0.65)
    tail = target_chars - head - 96
    return text[:head] + "\n\n...[context truncated by benchmark budget]...\n\n" + text[-max(0, tail) :]


def _case_for_prompt(case: dict[str, Any]) -> dict[str, Any]:
    """Return model-visible case data without leaking the expected answer key."""
    excluded = {"expected"}
    return {key: value for key, value in case.items() if key not in excluded}


def build_repair_prompt(case: dict[str, Any], context_ratio: float, max_context_chars: int) -> str:
    """Build a bounded prompt for replay repair root-cause diagnosis."""
    ratio = min(1.0, max(0.05, float(context_ratio)))
    budget = max(1200, math.floor(max_context_chars * ratio))
    visible_case = _case_for_prompt(_redact_json(case))
    case_context = _truncate_middle(_json_dumps(visible_case), budget)
    return textwrap.dedent(
        f"""
        You are benchmarking replay repair for Business Flow Recorder.

        Task:
        - Diagnose the replay failure from the case data.
        - Do not only repair the failing line.
        - First find the first divergence and the true root cause step.
        - Distinguish current-step locator failures from propagated failures caused by a missing,
          wrong, skipped, or extra previous step.
        - If the failed step expects a dialog, form, table row, selected option, or business state
          that is absent in actual replay, inspect previous steps before patching the symptom step.
        - Prefer stable business evidence: testId/data-e2e, dialog root, form label, table row key,
          semantic ancestor, UiActionRecipe, and terminal-state assertions.
        - Do not use bare nth(), global text, global placeholder, long CSS chains, XPath, or force
          clicks for critical actions.
        - The patch must be checkable by a deterministic applier/validator.

        Output contract:
        - Return only strict JSON.
        - The top-level schema must be replay-repair-patch/v1.
        - Do not return Markdown.
        - Do not return arbitrary TypeScript code as the final answer.
        - Do not include commentary outside JSON.

        Required JSON schema:
        {{
          "schema": "replay-repair-patch/v1",
          "caseId": "string",
          "diagnosis": {{
            "failureKind": "current-step-locator | propagated-missing-step | propagated-wrong-step | propagated-skipped-step | extra-step-state-drift | assertion-obsolete | application-behavior-change | unsafe-repair-rejected",
            "symptomStepId": "string",
            "rootCauseStepId": "string",
            "confidence": 0.0,
            "reason": "string"
          }},
          "patches": [
            {{
              "op": "insert-step | unskip-step | replace-recipe | replace-locator | replace-locator-scope | delete-step | add-assertion | update-assertion",
              "stepId": "string",
              "insertBeforeStepId": "string optional",
              "insertAfterStepId": "string optional",
              "recipe": "object optional",
              "locator": "object optional",
              "scope": "object optional",
              "reason": "string"
            }}
          ],
          "validationPlan": [
            "string"
          ],
          "risk": {{
            "level": "low | medium | high",
            "unsafePatterns": ["string"],
            "notes": "string"
          }}
        }}

        Case data:
        {case_context}
        """
    ).strip()


def _flatten_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(f"{key} {_flatten_text(item)}" for key, item in value.items())
    if isinstance(value, list):
        return " ".join(_flatten_text(item) for item in value)
    return str(value)


def _normalize(value: Any) -> str:
    return "".join(str(value).lower().split())


def _contains_keyword(text: str, keyword: str) -> bool:
    return _normalize(keyword) in _normalize(text)


def _score_keywords(text: str, keywords: list[str], present: bool) -> float:
    keywords = [keyword for keyword in keywords if keyword]
    if not keywords:
        return 1.0
    hits = sum(1 for keyword in keywords if _contains_keyword(text, keyword))
    ratio = hits / len(keywords)
    return ratio if present else 1.0 - ratio


def _diagnosis(parsed_output: dict[str, Any]) -> dict[str, Any]:
    diagnosis = parsed_output.get("diagnosis")
    return diagnosis if isinstance(diagnosis, dict) else {}


def _patches(parsed_output: dict[str, Any]) -> list[dict[str, Any]]:
    patches = parsed_output.get("patches")
    if not isinstance(patches, list):
        return []
    return [patch for patch in patches if isinstance(patch, dict)]


def _validation_plan(parsed_output: dict[str, Any]) -> list[str]:
    plan = parsed_output.get("validationPlan")
    if not isinstance(plan, list):
        return []
    return [item for item in plan if isinstance(item, str)]


def _risk(parsed_output: dict[str, Any]) -> dict[str, Any]:
    risk = parsed_output.get("risk")
    return risk if isinstance(risk, dict) else {}


def _schema_valid(parsed_output: Any) -> float:
    if not isinstance(parsed_output, dict):
        return 0.0
    if parsed_output.get("schema") != "replay-repair-patch/v1":
        return 0.0
    if not isinstance(parsed_output.get("caseId"), str):
        return 0.0
    diagnosis = _diagnosis(parsed_output)
    if diagnosis.get("failureKind") not in FAILURE_KINDS:
        return 0.0
    if not isinstance(diagnosis.get("symptomStepId"), str):
        return 0.0
    if not isinstance(diagnosis.get("rootCauseStepId"), str):
        return 0.0
    if not isinstance(diagnosis.get("reason"), str):
        return 0.0
    confidence = diagnosis.get("confidence")
    if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
        return 0.0
    if not isinstance(parsed_output.get("patches"), list):
        return 0.0
    for patch in _patches(parsed_output):
        if patch.get("op") not in PATCH_OPS:
            return 0.0
        if not isinstance(patch.get("stepId"), str):
            return 0.0
        if not isinstance(patch.get("reason"), str):
            return 0.0
    if not _validation_plan(parsed_output):
        return 0.0
    risk = _risk(parsed_output)
    if risk.get("level") not in RISK_LEVELS:
        return 0.0
    if not isinstance(risk.get("unsafePatterns"), list):
        return 0.0
    if not isinstance(risk.get("notes"), str):
        return 0.0
    return 1.0


def _patch_ops_score(expected: dict[str, Any], parsed_output: dict[str, Any]) -> float:
    required = [op for op in expected.get("requiredPatchOps", []) if op]
    if not required:
        return 1.0
    actual = {str(patch.get("op")) for patch in _patches(parsed_output)}
    return sum(1 for op in required if op in actual) / len(required)


def _validation_plan_score(parsed_output: dict[str, Any]) -> float:
    plan = _validation_plan(parsed_output)
    if not plan:
        return 0.0
    text = _flatten_text(plan)
    signal_terms = (
        "L1",
        "L2",
        "L3",
        "generated replay",
        "terminal",
        "business-flow",
        "parser-safe",
        "artifact",
        "unit",
        "dry-run",
        "deterministic",
    )
    signal_hits = sum(1 for term in signal_terms if _contains_keyword(text, term))
    length_score = min(1.0, len(plan) / 3)
    signal_score = min(1.0, signal_hits / 3)
    return round(length_score * 0.45 + signal_score * 0.55, 3)


def _safety_score(case: dict[str, Any], parsed_output: dict[str, Any]) -> float:
    text = _flatten_text(
        {
            "diagnosis": parsed_output.get("diagnosis"),
            "patches": parsed_output.get("patches"),
            "validationPlan": parsed_output.get("validationPlan"),
        }
    )
    normalized = text.lower()
    unsafe_hits = [pattern for pattern in UNSAFE_LOCATOR_PATTERNS if pattern in normalized]

    critical = bool(case.get("safety", {}).get("criticalAction")) or "critical" in str(case.get("name", "")).lower()
    if not unsafe_hits:
        return 1.0
    if critical:
        return 0.0 if len(unsafe_hits) >= 2 else 0.2
    return max(0.0, 1.0 - 0.25 * len(set(unsafe_hits)))


def score_repair_output(case: dict[str, Any], parsed_output: dict[str, Any]) -> dict[str, Any]:
    """Score a parsed replay repair patch against the hidden expected answer."""
    expected = case.get("expected", {})
    diagnosis = _diagnosis(parsed_output) if isinstance(parsed_output, dict) else {}
    all_text = _flatten_text(parsed_output)

    schema = _schema_valid(parsed_output)
    accepted_failure_kinds = set(expected.get("acceptedFailureKinds") or [expected.get("failureKind")])
    failure_kind = 1.0 if diagnosis.get("failureKind") in accepted_failure_kinds else 0.0
    root = 1.0 if diagnosis.get("rootCauseStepId") == expected.get("rootCauseStepId") else 0.0
    symptom = 1.0 if diagnosis.get("symptomStepId") == expected.get("symptomStepId") else 0.0
    patch_ops = _patch_ops_score(expected, parsed_output) if isinstance(parsed_output, dict) else 0.0
    required_keywords = _score_keywords(all_text, expected.get("requiredKeywords", []), present=True)
    forbidden_absent = _score_keywords(all_text, expected.get("forbiddenKeywords", []), present=False)
    validation = _validation_plan_score(parsed_output) if isinstance(parsed_output, dict) else 0.0
    safety = _safety_score(case, parsed_output) if isinstance(parsed_output, dict) else 0.0

    checks = {
        "schema_valid": round(schema, 3),
        "failure_kind_accuracy": round(failure_kind, 3),
        "root_cause_step_accuracy": round(root, 3),
        "symptom_step_accuracy": round(symptom, 3),
        "patch_ops_accuracy": round(patch_ops, 3),
        "required_keywords": round(required_keywords, 3),
        "forbidden_keywords_absent": round(forbidden_absent, 3),
        "validation_plan_quality": round(validation, 3),
        "safety": round(safety, 3),
    }
    overall = (
        schema * 0.10
        + failure_kind * 0.15
        + root * 0.25
        + patch_ops * 0.20
        + required_keywords * 0.05
        + forbidden_absent * 0.05
        + validation * 0.10
        + safety * 0.10
    )
    return {"overall": round(overall, 3), "checks": checks}


def _dry_run_output(case: dict[str, Any]) -> str:
    expected = case.get("expected", {})
    required_ops = expected.get("requiredPatchOps") or []
    patch_ops = required_ops[:2] if required_ops else []
    return _json_dumps(
        {
            "schema": "replay-repair-patch/v1",
            "caseId": case.get("name", "unnamed"),
            "diagnosis": {
                "failureKind": expected.get("failureKind", "current-step-locator"),
                "symptomStepId": expected.get("symptomStepId", ""),
                "rootCauseStepId": expected.get("rootCauseStepId", ""),
                "confidence": 0.0,
                "reason": "DRY_RUN: no model was called; this validates benchmark plumbing.",
            },
            "patches": [
                {
                    "op": op,
                    "stepId": expected.get("rootCauseStepId", ""),
                    "reason": "DRY_RUN placeholder patch op from expected metadata.",
                }
                for op in patch_ops
            ],
            "validationPlan": [
                "DRY_RUN: run deterministic L1 scorer/unit validation.",
                "DRY_RUN: run generated replay artifact check for the repaired flow.",
                "DRY_RUN: run L2/L3 replay when the deterministic applier is available.",
            ],
            "risk": {"level": "low", "unsafePatterns": [], "notes": "DRY_RUN"},
        }
    )


def run_one_model(case: dict[str, Any], model_id: str, model_cfg: dict[str, Any], context_ratio: float, args: argparse.Namespace) -> RepairRun:
    prompt = build_repair_prompt(case, context_ratio, args.max_context_chars)
    prompt_tokens = estimate_tokens(prompt)
    start = time.perf_counter()
    usage = None
    error = None
    try:
        if args.dry_run:
            output = _dry_run_output(case)
        else:
            output, usage = call_model(model_cfg, prompt, timeout=args.timeout)
        output = redact_secrets(output)
        parsed = parse_json_from_output(output)
        score = score_repair_output(case, parsed)
        ok = True
    except Exception as exc:
        output = locals().get("output", "")
        parsed = None
        score = None
        ok = False
        error = redact_secrets(str(exc))
    elapsed = time.perf_counter() - start
    output_tokens = estimate_tokens(output)
    return RepairRun(
        model_id=model_id,
        case_name=str(case.get("name", "unnamed")),
        context_ratio=context_ratio,
        ok=ok,
        elapsed_seconds=round(elapsed, 3),
        prompt_chars=len(prompt),
        output_chars=len(output),
        estimated_prompt_tokens=prompt_tokens,
        estimated_output_tokens=output_tokens,
        estimated_cost_usd=model_cost(model_cfg, prompt_tokens, output_tokens, usage),
        parsed_output=parsed,
        score=score,
        error=error,
        raw_output=None if args.no_raw else output,
        provider_usage=usage,
    )


def summarize_results(runs: list[RepairRun]) -> dict[str, Any]:
    by_model: dict[str, list[RepairRun]] = {}
    for run in runs:
        by_model.setdefault(run.model_id, []).append(run)

    ranked = []
    for model_id, model_runs in by_model.items():
        scores = [float((run.score or {}).get("overall") or 0.0) for run in model_runs]
        elapsed = [run.elapsed_seconds for run in model_runs]
        cost = sum(run.estimated_cost_usd for run in model_runs)
        avg_score = sum(scores) / len(scores) if scores else 0.0
        avg_elapsed = sum(elapsed) / len(elapsed) if elapsed else 0.0
        speed_score = min(1.0, 1.0 / max(0.5, avg_elapsed))
        composite = avg_score * 0.75 + speed_score * 0.15 - min(0.2, cost) * 0.10
        ranked.append(
            {
                "model_id": model_id,
                "run_count": len(model_runs),
                "ok_count": sum(1 for run in model_runs if run.ok),
                "average_score": round(avg_score, 3),
                "average_elapsed_seconds": round(avg_elapsed, 3),
                "estimated_cost_usd": round(cost, 6),
                "composite": round(composite, 3),
            }
        )
    ranked.sort(key=lambda item: item["composite"], reverse=True)

    by_case: dict[str, Any] = {}
    for case_name in sorted({run.case_name for run in runs}):
        case_runs = [run for run in runs if run.case_name == case_name]
        case_ranked = [
            {
                "model_id": run.model_id,
                "context_ratio": run.context_ratio,
                "ok": run.ok,
                "score": (run.score or {}).get("overall"),
                "elapsed_seconds": run.elapsed_seconds,
                "estimated_cost_usd": run.estimated_cost_usd,
            }
            for run in case_runs
        ]
        case_ranked.sort(key=lambda item: (item["score"] or 0.0, -item["elapsed_seconds"]), reverse=True)
        by_case[case_name] = {"ranked": case_ranked, "best": case_ranked[0] if case_ranked else None}
    return {"ranked": ranked, "by_case": by_case}


def _parse_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _parse_ratios(value: str) -> list[float]:
    return [float(part) for part in _parse_csv(value)]


def _case_paths(args: argparse.Namespace) -> list[Path]:
    if args.cases:
        return [Path(path) for path in _parse_csv(args.cases)]
    if args.case:
        return [Path(args.case)]
    return sorted(_cases_dir().glob("*.json"))


def _model_payload(model_ids: list[str]) -> dict[str, Any]:
    return {
        model_id: {
            key: value
            for key, value in DEFAULT_MODELS[model_id].items()
            if key not in {"api_key", "api_key_env"}
        }
        for model_id in model_ids
    }


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark replay repair model quality and speed.")
    parser.add_argument("--case", help="Single benchmark case path. Defaults to all built-in repair cases.")
    parser.add_argument("--cases", help="Comma-separated benchmark case paths. Overrides --case.")
    parser.add_argument("--models", default=",".join(DEFAULT_MODEL_IDS))
    parser.add_argument("--context-ratios", default="0.35,0.6,1.0")
    parser.add_argument("--max-context-chars", type=int, default=28_000)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--env-file", default="~/.hermes/.env")
    parser.add_argument("--dry-run", action="store_true", help="Do not call external models; validate prompts/scoring/output shape.")
    parser.add_argument("--no-raw", action="store_true", help="Do not store raw model output in the result JSON.")
    parser.add_argument("--output", default=str(_results_dir() / "latest.json"))
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if args.env_file:
        load_env_file(args.env_file)
    socket.setdefaulttimeout(args.timeout)

    model_ids = _parse_csv(args.models)
    ratios = _parse_ratios(args.context_ratios)
    for model_id in model_ids:
        if model_id not in DEFAULT_MODELS:
            print(f"Unknown model id: {model_id}", file=sys.stderr)
            return 2

    case_paths = _case_paths(args)
    cases = [_load_case(path) for path in case_paths]
    runs: list[RepairRun] = []
    for case in cases:
        for model_id in model_ids:
            for ratio in ratios:
                print(
                    f"[repair-benchmark] case={case.get('name', 'unnamed')} model={model_id} context={ratio}",
                    file=sys.stderr,
                    flush=True,
                )
                runs.append(run_one_model(case, model_id, DEFAULT_MODELS[model_id], ratio, args))

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cases": [{"name": case.get("name"), "title": case.get("title")} for case in cases],
        "models": _model_payload(model_ids),
        "runs": [run.__dict__ for run in runs],
        "summary": summarize_results(runs),
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(_json_dumps(payload), encoding="utf-8")
    print(_json_dumps({"output": str(output_path), "summary": payload["summary"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
