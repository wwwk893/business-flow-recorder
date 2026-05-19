from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from benchmarks.agent_models import agent_model_benchmark as agent_bench
from benchmarks.review_models import recording_review_benchmark as bench


CASES_DIR = Path(__file__).with_name("cases")


def load_case(name: str) -> dict:
    return json.loads((CASES_DIR / name).read_text(encoding="utf-8"))


class RecordingReviewBenchmarkTest(unittest.TestCase):
    def test_build_review_prompt_includes_generated_code_and_page_context(self) -> None:
        case = load_case("lan_review_missing_row_edit_before_input.json")
        prompt = bench.build_recording_review_prompt(case, context_ratio=0.5, max_context_chars=16_000)
        self.assertIn("Review rule-generated replay code", prompt)
        self.assertIn("recording-review-patch/v1", prompt)
        self.assertIn("Do not return Markdown", prompt)
        self.assertIn("Do not return TypeScript code", prompt)
        self.assertIn("s007", prompt)
        self.assertIn("s009", prompt)
        self.assertIn("编辑LAN1", prompt)
        self.assertIn("emittedCodeMap", prompt)
        self.assertIn("reviewSignals", prompt)
        self.assertNotIn("requiredPatchOps", prompt)

    def test_scores_lan_missing_row_edit_review_high_for_correct_patch(self) -> None:
        case = load_case("lan_review_missing_row_edit_before_input.json")
        parsed = {
            "schema": "recording-review-patch/v1",
            "diagnosis": {
                "overallRisk": "high",
                "summary": "Root cause is s007, not the later s009 placeholder. s007 is not emitted, so 编辑LAN1 is never opened before s009.",
                "issueCount": 1,
            },
            "issues": [
                {
                    "issueId": "issue-s007-s009",
                    "issueKind": "propagated-failure-risk",
                    "severity": "high",
                    "rootCauseStepId": "s007",
                    "affectedStepIds": ["s009"],
                    "reason": "s009 depends on 编辑LAN1 opened by s007.",
                    "evidence": ["s007 not emitted", "s009 before.dialog=编辑LAN1"],
                }
            ],
            "patches": [
                {"op": "force-emit-step", "stepId": "s007", "reason": "Restore the LAN1 row edit opener."},
                {"op": "replace-locator-scope", "stepId": "s009", "reason": "Scope LAN IP placeholder under 编辑LAN1."},
            ],
            "validationPlan": ["Validate s007 emits before s009.", "Replay the s007-s009 causal window.", "Confirm 编辑LAN1 exists before fill."],
            "autoApplyEligibility": {"eligible": False, "reason": "High-risk propagated state repair needs review.", "maxRisk": "high"},
        }
        score = bench.score_recording_review_output(case, parsed)
        self.assertGreaterEqual(score["overall"], 0.9)
        self.assertEqual(score["checks"]["root_cause_accuracy"], 1.0)
        self.assertEqual(score["checks"]["patch_ops_accuracy"], 1.0)

    def test_perfect_expected_output_scores_one(self) -> None:
        case = load_case("lan_review_missing_row_edit_before_input.json")
        expected = case["expected"]
        parsed = {
            "schema": "recording-review-patch/v1",
            "diagnosis": {
                "overallRisk": expected["overallRisk"],
                "summary": "s007 missing-emitted-step propagated-failure-risk affects s009 编辑LAN1 force-emit-step replace-locator-scope.",
                "issueCount": 1,
            },
            "issues": [
                {
                    "issueId": "perfect",
                    "issueKind": expected["issueKinds"][0],
                    "severity": expected["overallRisk"],
                    "rootCauseStepId": expected["rootCauseStepIds"][0],
                    "affectedStepIds": expected["affectedStepIds"],
                    "reason": "s007 not emitted before s009 编辑LAN1.",
                    "evidence": expected["requiredKeywords"],
                }
            ],
            "patches": [
                {"op": op, "stepId": expected["rootCauseStepIds"][0] if op != "replace-locator-scope" else expected["affectedStepIds"][0], "reason": f"{op} because s007->s009 编辑LAN1."}
                for op in expected["requiredPatchOps"]
            ],
            "validationPlan": ["Validate s007->s009 causal window and rerender parser-safe replay."],
            "autoApplyEligibility": {"eligible": False, "reason": "High risk requires confirmation.", "maxRisk": expected["overallRisk"]},
        }
        score = bench.score_recording_review_output(case, parsed)
        self.assertEqual(score["overall"], 1.0)

    def test_scores_lan_placeholder_only_patch_low(self) -> None:
        case = load_case("lan_review_missing_row_edit_before_input.json")
        parsed = {
            "schema": "recording-review-patch/v1",
            "diagnosis": {"overallRisk": "high", "summary": "Only make s009 placeholder stricter.", "issueCount": 1},
            "issues": [
                {
                    "issueId": "issue-s009",
                    "issueKind": "unscoped-dialog-field",
                    "severity": "high",
                    "rootCauseStepId": "s009",
                    "affectedStepIds": ["s009"],
                    "reason": "Use nth on the placeholder.",
                    "evidence": ["placeholder duplicate"],
                }
            ],
            "patches": [{"op": "replace-locator-scope", "stepId": "s009", "reason": "page.getByPlaceholder(...).nth(0)"}],
            "validationPlan": ["Run replay once."],
            "autoApplyEligibility": {"eligible": False, "reason": "Placeholder only.", "maxRisk": "high"},
        }
        score = bench.score_recording_review_output(case, parsed)
        self.assertLess(score["overall"], 0.65)
        self.assertEqual(score["checks"]["root_cause_accuracy"], 0.0)
        self.assertLess(score["checks"]["safety"], 1.0)

    def test_scores_good_flow_no_issue_without_false_positive(self) -> None:
        case = load_case("lan_review_good_flow_no_issue.json")
        parsed = {
            "schema": "recording-review-patch/v1",
            "diagnosis": {"overallRisk": "low", "summary": "No issue found.", "issueCount": 0},
            "issues": [],
            "patches": [],
            "validationPlan": ["Keep generated replay as-is.", "Run existing L1/L2 replay checks."],
            "autoApplyEligibility": {"eligible": False, "reason": "No patch needed.", "maxRisk": "low"},
        }
        score = bench.score_recording_review_output(case, parsed)
        self.assertGreaterEqual(score["overall"], 0.95)
        self.assertEqual(score["checks"]["false_positive_control"], 1.0)

    def test_forbids_wait_for_timeout_and_raw_ts_code(self) -> None:
        case = load_case("critical_delete_action_unsafe_review.json")
        parsed = {
            "schema": "recording-review-patch/v1",
            "diagnosis": {"overallRisk": "critical", "summary": "Use raw TypeScript with waitForTimeout and getByText.", "issueCount": 1},
            "issues": [
                {
                    "issueId": "bad-delete",
                    "issueKind": "unscoped-table-row-action",
                    "severity": "critical",
                    "rootCauseStepId": "s004",
                    "affectedStepIds": ["s004"],
                    "reason": "await page.waitForTimeout(300); await page.getByText(\"删除\").nth(0).click();",
                    "evidence": ["global getByText"],
                }
            ],
            "patches": [{"op": "replace-locator-scope", "stepId": "s004", "reason": "await page.getByText(\"删除\").nth(0).click();"}],
            "validationPlan": ["Run replay."],
            "autoApplyEligibility": {"eligible": False, "reason": "Unsafe.", "maxRisk": "critical"},
        }
        score = bench.score_recording_review_output(case, parsed)
        self.assertLessEqual(score["checks"]["safety"], 0.2)
        self.assertLess(score["overall"], 0.85)

    def test_redacts_secret_context(self) -> None:
        redacted = bench.redact_secrets("https://example.test/path?token=secret-token-value authorization: Bearer sk-abcdef1234567890")
        self.assertNotIn("secret-token-value", redacted)
        self.assertNotIn("sk-abcdef1234567890", redacted)
        self.assertIn("[REDACTED_API_KEY]", redacted)

    def test_dry_run_outputs_summary(self) -> None:
        case_path = CASES_DIR / "lan_review_missing_row_edit_before_input.json"
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "review-results.json"
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                rc = bench.main(
                    [
                        "--dry-run",
                        "--case",
                        str(case_path),
                        "--models",
                        "gpt-5.4-mini",
                        "--context-ratios",
                        "0.35",
                        "--output",
                        str(output_path),
                        "--no-raw",
                    ]
                )
            self.assertEqual(rc, 0)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertIn("generated_at", payload)
            self.assertEqual(len(payload["runs"]), 1)
            self.assertIn("ranked", payload["summary"])
            self.assertIn("by_case", payload["summary"])
            self.assertEqual(payload["runs"][0]["model_id"], "gpt-5.4-mini")
            self.assertIsNone(payload["runs"][0]["raw_output"])

    def test_reuses_agent_model_catalog(self) -> None:
        self.assertIs(bench.DEFAULT_MODELS, agent_bench.DEFAULT_MODELS)
        self.assertIn("deepseek-v4-flash-no-thinking", bench.DEFAULT_MODELS)
        self.assertIn("deepseek-v4-pro-thinking-high", bench.DEFAULT_MODELS)


if __name__ == "__main__":
    unittest.main()
