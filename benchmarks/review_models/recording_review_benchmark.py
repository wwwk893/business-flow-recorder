#!/usr/bin/env python3
"""Benchmark model quality for stop-recording AI review.

This harness is intentionally separate from production replay behavior. It reuses
the model catalog/provider helpers from benchmarks.agent_models.agent_model_benchmark
and only owns the review prompt, case schema, scoring, and reporting.
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

RISKS = {"low", "medium", "high", "critical"}
ISSUE_KINDS = {
    "missing-emitted-step",
    "weak-locator",
    "missing-state-transition",
    "propagated-failure-risk",
    "unscoped-table-row-action",
    "unscoped-dialog-field",
    "select-trigger-option-risk",
    "terminal-assertion-risk",
    "false-positive-none",
}
PATCH_OPS = {"force-emit-step", "replace-recipe", "replace-locator-scope", "add-locator-contract-hint", "mark-needs-human-review"}
UNSAFE_PATTERNS = ("waitfortimeout", "awaitpage.", "getbytext(", "global text", ".nth(", ".first(", ".last(", "xpath", "force:true", "long css")


@dataclass
class ReviewRun:
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
    return _redact_json(json.loads(Path(path).read_text(encoding="utf-8")))


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
    return text[:head] + "\n\n...[context truncated by review benchmark budget]...\n\n" + text[-max(0, tail) :]


def _case_for_prompt(case: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in case.items() if key != "expected"}


def build_recording_review_prompt(case: dict[str, Any], context_ratio: float, max_context_chars: int) -> str:
    ratio = min(1.0, max(0.05, float(context_ratio)))
    budget = max(1200, math.floor(max_context_chars * ratio))
    context = _truncate_middle(_json_dumps(_case_for_prompt(_redact_json(case))), budget)
    return textwrap.dedent(
        f"""
        You are benchmarking a Business Flow Recorder stop-recording AI review agent.

        Task:
        - Review rule-generated replay code before replay failure happens.
        - Use flow/context/generated code/emittedCodeMap/reviewSignals to find potential replay risks.
        - Find rootCauseStepId and affectedStepIds.
        - For propagated risk, identify the missing/wrong previous step instead of only fixing a later input locator.
        - Return only recording-review-patch/v1 JSON.
        - Do not return Markdown.
        - Do not return TypeScript code.
        - Do not suggest waitForTimeout.
        - Do not use global getByText, unscoped nth/first/last, global placeholder, XPath, force click, or long CSS for critical actions.

        Required JSON schema:
        {{
          "schema": "recording-review-patch/v1",
          "diagnosis": {{
            "overallRisk": "low | medium | high | critical",
            "summary": "string",
            "issueCount": 0
          }},
          "issues": [
            {{
              "issueId": "string",
              "issueKind": "missing-emitted-step | weak-locator | missing-state-transition | propagated-failure-risk | unscoped-table-row-action | unscoped-dialog-field | select-trigger-option-risk | terminal-assertion-risk | false-positive-none",
              "severity": "low | medium | high | critical",
              "rootCauseStepId": "string",
              "affectedStepIds": ["string"],
              "reason": "string",
              "evidence": ["string"]
            }}
          ],
          "patches": [
            {{
              "op": "force-emit-step | replace-recipe | replace-locator-scope | add-locator-contract-hint | mark-needs-human-review",
              "stepId": "string",
              "reason": "string"
            }}
          ],
          "validationPlan": ["string"],
          "autoApplyEligibility": {{
            "eligible": false,
            "reason": "string",
            "maxRisk": "low | medium | high | critical"
          }}
        }}

        Case data:
        {context}
        """
    ).strip()


def _flatten(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(f"{key} {_flatten(item)}" for key, item in value.items())
    if isinstance(value, list):
        return " ".join(_flatten(item) for item in value)
    return str(value)


def _norm(value: Any) -> str:
    return "".join(str(value).lower().split())


def _score_required(text: str, keywords: list[str]) -> float:
    if not keywords:
        return 1.0
    return sum(1 for keyword in keywords if _norm(keyword) in _norm(text)) / len(keywords)


def _score_forbidden_absent(text: str, keywords: list[str]) -> float:
    if not keywords:
        return 1.0
    return 1.0 - sum(1 for keyword in keywords if _norm(keyword) in _norm(text)) / len(keywords)


def _schema_valid(parsed: Any) -> float:
    if not isinstance(parsed, dict) or parsed.get("schema") != "recording-review-patch/v1":
        return 0.0
    diagnosis = parsed.get("diagnosis") if isinstance(parsed.get("diagnosis"), dict) else {}
    if diagnosis.get("overallRisk") not in RISKS or not isinstance(diagnosis.get("summary"), str) or not isinstance(diagnosis.get("issueCount"), int):
        return 0.0
    if not isinstance(parsed.get("issues"), list) or not isinstance(parsed.get("patches"), list):
        return 0.0
    for issue in parsed["issues"]:
        if issue.get("issueKind") not in ISSUE_KINDS or issue.get("severity") not in RISKS:
            return 0.0
        if not isinstance(issue.get("rootCauseStepId"), str) or not isinstance(issue.get("affectedStepIds"), list):
            return 0.0
    for patch in parsed["patches"]:
        if patch.get("op") not in PATCH_OPS or not isinstance(patch.get("stepId"), str):
            return 0.0
    if not isinstance(parsed.get("validationPlan"), list):
        return 0.0
    auto = parsed.get("autoApplyEligibility") if isinstance(parsed.get("autoApplyEligibility"), dict) else {}
    if not isinstance(auto.get("eligible"), bool) or auto.get("maxRisk") not in RISKS:
        return 0.0
    return 1.0


def _risk_score(expected: dict[str, Any], parsed: dict[str, Any]) -> float:
    actual = parsed.get("diagnosis", {}).get("overallRisk")
    expected_risk = expected.get("overallRisk")
    if actual == expected_risk:
        return 1.0
    if expected_risk == "high" and actual == "critical":
        return 1.0
    if expected_risk == "critical" and actual == "high":
        return 0.8
    return 0.0


def _set_score(expected_items: list[str], actual_items: list[str]) -> float:
    expected_items = [item for item in expected_items if item]
    if not expected_items:
        return 1.0
    actual = set(actual_items)
    return sum(1 for item in expected_items if item in actual) / len(expected_items)


def _safety_score(parsed: dict[str, Any]) -> float:
    text = _norm(_flatten(parsed))
    hits = sum(1 for pattern in UNSAFE_PATTERNS if pattern in text)
    return max(0.0, 1.0 - hits * 0.35)


def _false_positive_score(expected: dict[str, Any], parsed: dict[str, Any]) -> float:
    if not expected.get("noIssueExpected"):
        return 1.0
    issues = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []
    patches = parsed.get("patches") if isinstance(parsed.get("patches"), list) else []
    risk = parsed.get("diagnosis", {}).get("overallRisk")
    no_issues = not issues or all(issue.get("issueKind") == "false-positive-none" for issue in issues)
    return 1.0 if no_issues and not patches and risk == "low" else 0.0


def score_recording_review_output(case: dict[str, Any], parsed_output: dict[str, Any]) -> dict[str, Any]:
    expected = case.get("expected", {})
    issues = parsed_output.get("issues") if isinstance(parsed_output, dict) and isinstance(parsed_output.get("issues"), list) else []
    patches = parsed_output.get("patches") if isinstance(parsed_output, dict) and isinstance(parsed_output.get("patches"), list) else []
    text = _flatten(parsed_output)
    no_issue_expected = bool(expected.get("noIssueExpected"))
    no_issue_reported = not issues or all(issue.get("issueKind") == "false-positive-none" for issue in issues)
    issue_kind_accuracy = 1.0 if no_issue_expected and no_issue_reported else _set_score(expected.get("issueKinds", []), [issue.get("issueKind") for issue in issues])
    checks = {
        "schema_valid": _schema_valid(parsed_output),
        "risk_accuracy": _risk_score(expected, parsed_output) if isinstance(parsed_output, dict) else 0.0,
        "issue_kind_accuracy": issue_kind_accuracy,
        "root_cause_accuracy": _set_score(expected.get("rootCauseStepIds", []), [issue.get("rootCauseStepId") for issue in issues]),
        "affected_steps_accuracy": _set_score(expected.get("affectedStepIds", []), [step_id for issue in issues for step_id in issue.get("affectedStepIds", [])]),
        "patch_ops_accuracy": _set_score(expected.get("requiredPatchOps", []), [patch.get("op") for patch in patches]),
        "required_keywords": _score_required(text, expected.get("requiredKeywords", [])),
        "forbidden_keywords_absent": _score_forbidden_absent(text, expected.get("forbiddenKeywords", [])),
        "false_positive_control": _false_positive_score(expected, parsed_output),
        "safety": _safety_score(parsed_output) if isinstance(parsed_output, dict) else 0.0,
    }
    overall = (
        checks["schema_valid"] * 0.10
        + checks["risk_accuracy"] * 0.10
        + checks["issue_kind_accuracy"] * 0.15
        + checks["root_cause_accuracy"] * 0.25
        + checks["affected_steps_accuracy"] * 0.05
        + checks["patch_ops_accuracy"] * 0.10
        + ((checks["required_keywords"] + checks["forbidden_keywords_absent"]) / 2) * 0.10
        + checks["false_positive_control"] * 0.05
        + checks["safety"] * 0.10
    )
    if checks["safety"] <= 0.2:
        overall = min(overall, 0.8)
    rounded = {key: round(value, 3) for key, value in checks.items()}
    return {"overall": round(overall, 3), "checks": rounded}


def _dry_run_output(case: dict[str, Any]) -> str:
    expected = case.get("expected", {})
    no_issue = expected.get("noIssueExpected")
    issues = [] if no_issue else [{
        "issueId": f"dry-{case.get('name', 'case')}",
        "issueKind": (expected.get("issueKinds") or ["weak-locator"])[0],
        "severity": expected.get("overallRisk", "medium"),
        "rootCauseStepId": (expected.get("rootCauseStepIds") or [""])[0],
        "affectedStepIds": expected.get("affectedStepIds", []),
        "reason": "DRY_RUN expected issue.",
        "evidence": expected.get("requiredKeywords", [])[:2],
    }]
    return _json_dumps({
        "schema": "recording-review-patch/v1",
        "diagnosis": {
            "overallRisk": expected.get("overallRisk", "low"),
            "summary": "DRY_RUN: no model was called.",
            "issueCount": len(issues),
        },
        "issues": issues,
        "patches": [] if no_issue else [{"op": op, "stepId": (expected.get("rootCauseStepIds") or [""])[0], "reason": "DRY_RUN op."} for op in (expected.get("requiredPatchOps") or [])[:2]],
        "validationPlan": ["DRY_RUN: run L1 review benchmark.", "DRY_RUN: rerender parser-safe code.", "DRY_RUN: run targeted replay validation."],
        "autoApplyEligibility": {"eligible": False, "reason": "DRY_RUN", "maxRisk": expected.get("overallRisk", "low")},
    })


def run_one_model(case: dict[str, Any], model_id: str, model_cfg: dict[str, Any], context_ratio: float, args: argparse.Namespace) -> ReviewRun:
    prompt = build_recording_review_prompt(case, context_ratio, args.max_context_chars)
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
        score = score_recording_review_output(case, parsed)
        ok = True
    except Exception as exc:
        output = locals().get("output", "")
        parsed = None
        score = None
        ok = False
        error = redact_secrets(str(exc))
    elapsed = time.perf_counter() - start
    output_tokens = estimate_tokens(output)
    return ReviewRun(
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


def summarize_results(runs: list[ReviewRun]) -> dict[str, Any]:
    by_model: dict[str, list[ReviewRun]] = {}
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
        ranked.append({
            "model_id": model_id,
            "run_count": len(model_runs),
            "ok_count": sum(1 for run in model_runs if run.ok),
            "average_score": round(avg_score, 3),
            "average_elapsed_seconds": round(avg_elapsed, 3),
            "estimated_cost_usd": round(cost, 6),
            "composite": round(avg_score * 0.75 + speed_score * 0.15 - min(0.2, cost) * 0.10, 3),
        })
    ranked.sort(key=lambda item: item["composite"], reverse=True)
    by_case: dict[str, Any] = {}
    for case_name in sorted({run.case_name for run in runs}):
        case_runs = [run for run in runs if run.case_name == case_name]
        case_ranked = [{
            "model_id": run.model_id,
            "context_ratio": run.context_ratio,
            "ok": run.ok,
            "score": (run.score or {}).get("overall"),
            "elapsed_seconds": run.elapsed_seconds,
            "estimated_cost_usd": run.estimated_cost_usd,
        } for run in case_runs]
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
    return {model_id: {key: value for key, value in DEFAULT_MODELS[model_id].items() if key not in {"api_key", "api_key_env"}} for model_id in model_ids}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark stop-recording review model quality and speed.")
    parser.add_argument("--case")
    parser.add_argument("--cases")
    parser.add_argument("--models", default=",".join(DEFAULT_MODEL_IDS))
    parser.add_argument("--context-ratios", default="0.35,0.6,1.0")
    parser.add_argument("--max-context-chars", type=int, default=28_000)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--env-file", default="~/.hermes/.env")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-raw", action="store_true")
    parser.add_argument("--output", default=str(_results_dir() / "latest.json"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    if args.env_file:
        load_env_file(args.env_file)
    socket.setdefaulttimeout(args.timeout)
    model_ids = _parse_csv(args.models)
    ratios = _parse_ratios(args.context_ratios)
    for model_id in model_ids:
        if model_id not in DEFAULT_MODELS:
            print(f"Unknown model id: {model_id}", file=sys.stderr)
            return 2
    cases = [_load_case(path) for path in _case_paths(args)]
    runs: list[ReviewRun] = []
    for case in cases:
        for model_id in model_ids:
            for ratio in ratios:
                print(f"[review-benchmark] case={case.get('name', 'unnamed')} model={model_id} context={ratio}", file=sys.stderr, flush=True)
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
