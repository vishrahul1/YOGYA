"""Deterministic eligibility rules engine public API."""

from .engine import (
    RuleResult,
    SchemeEvaluation,
    evaluate_rule,
    evaluate_scheme,
    validate_rule,
)

__all__ = [
    "RuleResult",
    "SchemeEvaluation",
    "evaluate_rule",
    "evaluate_scheme",
    "validate_rule",
]
