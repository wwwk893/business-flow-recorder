from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from benchmarks.repair_models import repair_model_benchmark as bench


CASES_DIR = Path(__file__).with_name("cases")


def load_case(name: str) -> dict:
    return json.loads((CASES_DIR / name).read_text(encoding="utf-8"))


class RepairModelBenchmarkTest(unittest.TestCase):
    def test_build_prompt_includes_causal_window_and_not_only_failing_step(self) -> None:
        case = load_case("lan_missing_edit_step_propagated_failure.json")
        prompt = bench.build_repair_prompt(case, context_ratio=0.35, max_context_chars=12_000)
        self.assertIn("Do not only repair the failing line", prompt)
        self.assertIn("first divergence", prompt)
        self.assertIn("root cause step", prompt)
        self.assertIn("replay-repair-patch/v1", prompt)
        self.assertIn("Do not return Markdown", prompt)
        self.assertIn("deterministic applier/validator", prompt)
        self.assertIn("s007", prompt)
        self.assertIn("s009", prompt)
        self.assertNotIn("requiredPatchOps", prompt)

    def test_scores_lan_missing_edit_step_correct_patch_high(self) -> None:
        case = load_case("lan_missing_edit_step_propagated_failure.json")
        parsed = {
            "schema": "replay-repair-patch/v1",
            "caseId": case["name"],
            "diagnosis": {
                "failureKind": "propagated-skipped-step",
                "symptomStepId": "s009",
                "rootCauseStepId": "s007",
                "confidence": 0.92,
                "reason": "s009 is only the symptom. First divergence is s007: the LAN1 edit row action was skipped, so 编辑LAN1 never opened.",
            },
            "patches": [
                {
                    "op": "unskip-step",
                    "stepId": "s007",
                    "reason": "s007 must run before the LAN IP field exists.",
                },
                {
                    "op": "replace-locator-scope",
                    "stepId": "s007",
                    "scope": {
                        "sectionTestId": "lan-device-section",
                        "rowText": "LAN1",
                        "dialogAfter": "编辑LAN1",
                    },
                    "reason": "Use the row-scoped LAN1 action instead of leaving s007 without source.",
                },
            ],
            "validationPlan": [
                "Run L1 stepStability scorer for propagated skipped row edit.",
                "Regenerate generated replay artifact and assert s007 appears before s009.",
                "Run L2/L3 replay and verify 编辑LAN1 opens and terminal state is correct.",
            ],
            "risk": {"level": "medium", "unsafePatterns": [], "notes": "Requires row scope evidence already present in flow."},
        }
        score = bench.score_repair_output(case, parsed)
        self.assertGreaterEqual(score["overall"], 0.9)
        self.assertEqual(score["checks"]["root_cause_step_accuracy"], 1.0)
        self.assertEqual(score["checks"]["patch_ops_accuracy"], 1.0)

    def test_scores_lan_current_step_only_placeholder_patch_low(self) -> None:
        case = load_case("lan_missing_edit_step_propagated_failure.json")
        parsed = {
            "schema": "replay-repair-patch/v1",
            "caseId": case["name"],
            "diagnosis": {
                "failureKind": "current-step-locator",
                "symptomStepId": "s009",
                "rootCauseStepId": "s009",
                "confidence": 0.74,
                "reason": "Only fix s009 placeholder strictness.",
            },
            "patches": [
                {
                    "op": "replace-locator",
                    "stepId": "s009",
                    "locator": {"source": "page.getByPlaceholder(\"例如：192.168.1.1/24\").nth(0)"},
                    "reason": "Use the first placeholder match.",
                }
            ],
            "validationPlan": [
                "Run generated replay once."
            ],
            "risk": {"level": "medium", "unsafePatterns": ["global placeholder", "nth"], "notes": "Symptom-only patch."},
        }
        score = bench.score_repair_output(case, parsed)
        self.assertLess(score["overall"], 0.55)
        self.assertEqual(score["checks"]["root_cause_step_accuracy"], 0.0)
        self.assertLess(score["checks"]["safety"], 1.0)

    def test_scores_current_step_locator_repair_high_for_strict_mode_case(self) -> None:
        case = load_case("lan_placeholder_strict_mode_current_step.json")
        parsed = {
            "schema": "replay-repair-patch/v1",
            "caseId": case["name"],
            "diagnosis": {
                "failureKind": "current-step-locator",
                "symptomStepId": "s009",
                "rootCauseStepId": "s009",
                "confidence": 0.88,
                "reason": "The expected 编辑LAN1 state exists; the current step uses a broad placeholder without form scope.",
            },
            "patches": [
                {
                    "op": "replace-locator-scope",
                    "stepId": "s009",
                    "scope": {"dialogTitle": "编辑LAN1", "formItem": "LAN IP", "placeholder": "例如：192.168.1.1/24"},
                    "reason": "Scope placeholder through visible dialog and form item.",
                }
            ],
            "validationPlan": [
                "Run L1 current-step locator unit.",
                "Regenerate generated replay artifact and confirm dialog/form/placeholder scope.",
                "Run deterministic replay with terminal assertion.",
            ],
            "risk": {"level": "low", "unsafePatterns": [], "notes": "No previous step repair is needed."},
        }
        score = bench.score_repair_output(case, parsed)
        self.assertGreaterEqual(score["overall"], 0.85)
        self.assertEqual(score["checks"]["failure_kind_accuracy"], 1.0)

    def test_forbids_unsafe_global_text_or_nth_for_critical_case(self) -> None:
        case = load_case("critical_row_action_without_rowkey_negative.json")
        parsed = {
            "schema": "replay-repair-patch/v1",
            "caseId": case["name"],
            "diagnosis": {
                "failureKind": "current-step-locator",
                "symptomStepId": "s004",
                "rootCauseStepId": "s004",
                "confidence": 0.61,
                "reason": "Use a global delete text locator.",
            },
            "patches": [
                {
                    "op": "replace-locator",
                    "stepId": "s004",
                    "locator": {"source": "page.getByText(\"删除\").nth(0)"},
                    "reason": "Pick the first matching delete control.",
                }
            ],
            "validationPlan": [
                "Run replay."
            ],
            "risk": {"level": "high", "unsafePatterns": ["getByText(\"删除\")", "nth"], "notes": "May delete wrong row."},
        }
        score = bench.score_repair_output(case, parsed)
        self.assertLessEqual(score["checks"]["safety"], 0.2)
        self.assertLess(score["overall"], 0.75)

    def test_dry_run_outputs_summary(self) -> None:
        case_path = CASES_DIR / "lan_missing_edit_step_propagated_failure.json"
        with tempfile.TemporaryDirectory() as tmp:
            output_path = Path(tmp) / "repair-results.json"
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

    def test_redacts_secrets(self) -> None:
        redacted = bench.redact_secrets("authorization: Bearer sk-1234567890abcdef token=super-secret-value")
        self.assertNotIn("sk-1234567890abcdef", redacted)
        self.assertNotIn("super-secret-value", redacted)
        self.assertIn("[REDACTED_API_KEY]", redacted)


if __name__ == "__main__":
    unittest.main()
