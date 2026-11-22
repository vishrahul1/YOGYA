"""Deterministic eligibility rules engine (rule format v1).

Pure standard library. No database, network, or app.* imports, so the engine
can be unit tested in isolation. Every leaf outcome is PASS, FAIL or UNKNOWN.
AI never decides eligibility; it only feeds profile extraction and explanations.
"""

from __future__ import annotations

import math
import operator
import re
from dataclasses import dataclass
from typing import Any, Callable

# Rule-level outcomes
PASS = "PASS"
FAIL = "FAIL"
UNKNOWN = "UNKNOWN"

# Scheme-level outcomes
UNVERIFIED = "UNVERIFIED"
NOT_ELIGIBLE = "NOT_ELIGIBLE"
NEED_MORE_INFORMATION = "NEED_MORE_INFORMATION"
LIKELY_ELIGIBLE = "LIKELY_ELIGIBLE"

PUBLISHED_STATUS = "published"

_KEY_RE = re.compile(r"[a-z][a-z0-9_]{0,63}")

_COMPARATORS: dict[str, Callable[[float, float], bool]] = {
    "lt": operator.lt,
    "lte": operator.le,
    "eq": operator.eq,
    "gte": operator.ge,
    "gt": operator.gt,
}
_BETWEEN = "between"
_SET_OPS = frozenset({"in", "not_in"})
_BOOL_OPS = frozenset({"is_true", "is_false"})
_NEQ_OP = "neq"
_PRESENCE_OPS = frozenset({"is_set"})
_ALL_OPS = frozenset(_COMPARATORS) | {_BETWEEN, _NEQ_OP} | _SET_OPS | _BOOL_OPS | _PRESENCE_OPS
_LEAF_KEYS = frozenset({"attr", "op", "value", "label"})
_COMBINATORS = ("all", "any")


@dataclass(frozen=True)
class RuleResult:
    rule_label: str
    result: str
    missing_attributes: list[str]
    explanation: str


@dataclass(frozen=True)
class SchemeEvaluation:
    scheme_version_id: str
    outcome: str
    rule_results: list[RuleResult]
    missing_attributes: list[str]
    reason: str


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def _is_real_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def validate_rule(node: Any) -> list[str]:
    """Return a list of validation errors for a rule tree (empty if valid)."""
    errors: list[str] = []
    _validate(node, "rule", errors)
    return errors


def _validate(node: Any, path: str, errors: list[str]) -> None:
    if not isinstance(node, dict):
        errors.append(f"{path}: rule node must be an object")
        return

    if "if" in node or "then" in node:
        if set(node) != {"if", "then"}:
            errors.append(f"{path}: conditional must have exactly 'if' and 'then'")
            return
        _validate(node["if"], f"{path}.if", errors)
        _validate(node["then"], f"{path}.then", errors)
        return

    combinators = [key for key in _COMBINATORS if key in node]
    if combinators:
        key = combinators[0]
        if set(node) != {key}:
            errors.append(f"{path}: '{key}' node must not have other keys")
            return
        children = node[key]
        if not isinstance(children, list) or not children:
            errors.append(f"{path}: '{key}' requires a non-empty list of nodes")
            return
        for index, child in enumerate(children):
            _validate(child, f"{path}.{key}[{index}]", errors)
        return

    if "attr" in node:
        _validate_leaf(node, path, errors)
        return

    errors.append(f"{path}: unrecognised rule node keys {sorted(str(k) for k in node)}")


def _validate_leaf(node: dict, path: str, errors: list[str]) -> None:
    extra = set(node) - _LEAF_KEYS
    if extra:
        errors.append(f"{path}: unknown keys {sorted(str(k) for k in extra)}")

    attr = node.get("attr")
    if not isinstance(attr, str) or not _KEY_RE.fullmatch(attr):
        errors.append(
            f"{path}: attr must be lowercase snake_case (a-z, 0-9, _), "
            "starting with a letter, at most 64 characters"
        )

    label = node.get("label")
    if not isinstance(label, str) or not label.strip():
        errors.append(f"{path}: label is required and must be non-empty text")

    op = node.get("op")
    if not isinstance(op, str) or op not in _ALL_OPS:
        errors.append(f"{path}: unknown op {op!r}")
        return

    if op in _BOOL_OPS or op in _PRESENCE_OPS:
        if "value" in node:
            errors.append(f"{path}: op '{op}' takes no value")
        return

    if "value" not in node:
        errors.append(f"{path}: op '{op}' requires a value")
        return

    value = node["value"]
    if op in _COMPARATORS:
        if not _is_real_number(value):
            errors.append(f"{path}: op '{op}' requires a finite numeric value")
    elif op == _BETWEEN:
        if not (
            isinstance(value, list)
            and len(value) == 2
            and all(_is_real_number(v) for v in value)
        ):
            errors.append(f"{path}: op 'between' requires [low, high] numbers")
        elif value[0] > value[1]:
            errors.append(f"{path}: op 'between' requires low <= high")
    elif op == _NEQ_OP:
        if not _is_scalar(value):
            errors.append(f"{path}: op 'neq' requires a scalar value")
    else:  # in / not_in
        if not isinstance(value, list) or not value:
            errors.append(f"{path}: op '{op}' requires a non-empty list")


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def _to_number(raw: Any) -> float | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)):
        number = float(raw)
    elif isinstance(raw, str):
        try:
            number = float(raw.strip())
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def _is_scalar(raw: Any) -> bool:
    if isinstance(raw, float):
        return math.isfinite(raw)
    return isinstance(raw, (str, int, bool))


def _node_label(node: dict) -> str:
    if "attr" in node:
        return node["label"]
    if "if" in node:
        return f"if {_node_label(node['if'])} then {_node_label(node['then'])}"
    key = "all" if "all" in node else "any"
    joiner = " AND " if key == "all" else " OR "
    return "(" + joiner.join(_node_label(child) for child in node[key]) + ")"


def evaluate_rule(node: Any, profile: dict) -> RuleResult:
    """Evaluate one rule tree against a profile. Raises ValueError for invalid rules."""
    errors = validate_rule(node)
    if errors:
        raise ValueError(errors)
    data = profile if isinstance(profile, dict) else {}
    return _evaluate(node, data)


def _evaluate(node: dict, data: dict) -> RuleResult:
    if "if" in node:
        return _evaluate_conditional(node, data)
    if "attr" in node:
        return _evaluate_leaf(node, data)

    key = "all" if "all" in node else "any"
    children = [_evaluate(child, data) for child in node[key]]
    outcomes = [child.result for child in children]
    missing = sorted({m for child in children for m in child.missing_attributes})
    explanation = "; ".join(child.explanation for child in children)

    if key == "all":
        if FAIL in outcomes:
            outcome = FAIL
        elif UNKNOWN in outcomes:
            outcome = UNKNOWN
        else:
            outcome = PASS
    else:
        if PASS in outcomes:
            outcome = PASS
        elif UNKNOWN in outcomes:
            outcome = UNKNOWN
        else:
            outcome = FAIL

    return RuleResult(_node_label(node), outcome, missing, explanation)


def _evaluate_conditional(node: dict, data: dict) -> RuleResult:
    label = _node_label(node)
    condition = _evaluate(node["if"], data)

    if condition.result == FAIL:
        return RuleResult(label, PASS, [], "not applicable")
    if condition.result == UNKNOWN:
        return RuleResult(
            label,
            UNKNOWN,
            list(condition.missing_attributes),
            f"condition could not be determined: {condition.explanation}",
        )

    consequence = _evaluate(node["then"], data)
    return RuleResult(
        label,
        consequence.result,
        list(consequence.missing_attributes),
        consequence.explanation,
    )


def _evaluate_leaf(node: dict, data: dict) -> RuleResult:
    key: str = node["attr"]
    op: str = node["op"]
    label: str = node["label"]
    expected = node.get("value")

    raw = data.get(key)

    if op in _PRESENCE_OPS:
        # Absence is a definite FAIL, never UNKNOWN.
        met = raw is not None and raw != ""
        status = "met" if met else "not met"
        return RuleResult(
            label, PASS if met else FAIL, [], f"{label}: {status} ({key} is_set)"
        )

    if raw is None:
        return RuleResult(label, UNKNOWN, [key], f"{key} is missing")

    unusable = RuleResult(label, UNKNOWN, [], f"value for {key} is not usable")

    if op == _NEQ_OP:
        if _is_real_number(expected):
            number = _to_number(raw)
            if number is None:
                return unusable
            met = number != expected
        else:
            if not _is_scalar(raw):
                return unusable
            met = raw != expected
        described = f"neq {expected}"
    elif op in _COMPARATORS or op == _BETWEEN:
        number = _to_number(raw)
        if number is None:
            return unusable
        if op == _BETWEEN:
            low, high = expected
            met = low <= number <= high
            described = f"between {low} and {high}"
        else:
            met = _COMPARATORS[op](number, expected)
            described = f"{op} {expected}"
    elif op in _SET_OPS:
        if not _is_scalar(raw):
            return unusable
        member = raw in expected
        met = member if op == "in" else not member
        described = f"{op} {expected}"
    else:  # is_true / is_false
        if not isinstance(raw, bool):
            return unusable
        met = raw if op == "is_true" else not raw
        described = op

    outcome = PASS if met else FAIL
    status = "met" if met else "not met"
    return RuleResult(label, outcome, [], f"{label}: {status} ({key} {described})")


def evaluate_scheme(
    scheme_status: str,
    scheme_version_id: str,
    rules: list[dict],
    profile: dict,
) -> SchemeEvaluation:
    """Evaluate every rule of one scheme version and map to a scheme outcome."""
    if scheme_status != PUBLISHED_STATUS:
        return SchemeEvaluation(
            scheme_version_id,
            UNVERIFIED,
            [],
            [],
            "scheme version is not published and verified",
        )

    if not isinstance(rules, list):
        raise ValueError(["rules must be a list"])

    errors: list[str] = []
    for index, rule in enumerate(rules):
        errors.extend(f"rules[{index}]: {err}" for err in validate_rule(rule))
    if errors:
        raise ValueError(errors)

    if not rules:
        return SchemeEvaluation(
            scheme_version_id, NEED_MORE_INFORMATION, [], [], "no rules recorded"
        )

    data = profile if isinstance(profile, dict) else {}
    rule_results = [_evaluate(rule, data) for rule in rules]
    missing = sorted({m for r in rule_results for m in r.missing_attributes})
    outcomes = [r.result for r in rule_results]

    if FAIL in outcomes:
        outcome = NOT_ELIGIBLE
        reason = "at least one eligibility rule failed"
    elif UNKNOWN in outcomes:
        outcome = NEED_MORE_INFORMATION
        if missing:
            reason = "more information needed for: " + ", ".join(missing)
        else:
            reason = "some eligibility rules could not be determined"
    else:
        outcome = LIKELY_ELIGIBLE
        reason = "all eligibility rules passed; this is not a guarantee of award"

    return SchemeEvaluation(scheme_version_id, outcome, rule_results, missing, reason)
