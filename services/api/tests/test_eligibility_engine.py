"""Tests for the deterministic eligibility engine (rule format v1).

All profiles here are synthetic. No personal data, no database, no network.
"""

import pytest

from app.eligibility import evaluate_rule, evaluate_scheme, validate_rule
from app.eligibility.adapter import adapt_rule_document
from app.eligibility.engine import (
    FAIL,
    LIKELY_ELIGIBLE,
    NEED_MORE_INFORMATION,
    NOT_ELIGIBLE,
    PASS,
    UNKNOWN,
    UNVERIFIED,
)

PROFILE = {
    "income": 50000,
    "category": "sc",
    "hostel": True,
    "tuition_paid": False,
    "yes": True,
    "no": False,
}


def leaf(attr, op, value=None, label=None):
    node = {"attr": attr, "op": op, "label": label or f"{attr} {op}"}
    if value is not None:
        node["value"] = value
    return node


# ---------------------------------------------------------------------------
# Leaf operators
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "op, value, expected",
    [
        ("lt", 60000, PASS),
        ("lt", 40000, FAIL),
        ("lte", 50000, PASS),
        ("lte", 49999, FAIL),
        ("eq", 50000, PASS),
        ("eq", 1, FAIL),
        ("gte", 50000, PASS),
        ("gte", 50001, FAIL),
        ("gt", 49999, PASS),
        ("gt", 50000, FAIL),
    ],
)
def test_numeric_operators_pass_and_fail(op, value, expected):
    result = evaluate_rule(leaf("income", op, value), PROFILE)
    assert result.result == expected
    assert result.missing_attributes == []


@pytest.mark.parametrize(
    "bounds, expected",
    [
        ([50000, 60000], PASS),  # low boundary inclusive
        ([50001, 60000], FAIL),
        ([40000, 50000], PASS),  # high boundary inclusive
        ([40000, 49999], FAIL),
    ],
)
def test_between_is_inclusive_at_both_ends(bounds, expected):
    result = evaluate_rule(leaf("income", "between", bounds), PROFILE)
    assert result.result == expected


@pytest.mark.parametrize(
    "op, value, expected",
    [
        ("in", ["sc", "st"], PASS),
        ("in", ["obc"], FAIL),
        ("not_in", ["sc"], FAIL),
        ("not_in", ["obc"], PASS),
    ],
)
def test_in_and_not_in(op, value, expected):
    result = evaluate_rule(leaf("category", op, value), PROFILE)
    assert result.result == expected


@pytest.mark.parametrize(
    "attr, op, expected",
    [
        ("hostel", "is_true", PASS),
        ("tuition_paid", "is_true", FAIL),
        ("hostel", "is_false", FAIL),
        ("tuition_paid", "is_false", PASS),
    ],
)
def test_is_true_and_is_false(attr, op, expected):
    result = evaluate_rule(leaf(attr, op), PROFILE)
    assert result.result == expected


def test_neq_pass_when_value_differs():
    result = evaluate_rule(leaf("category", "neq", "obc"), PROFILE)
    assert result.result == PASS
    assert result.missing_attributes == []


def test_neq_fail_when_value_equal():
    result = evaluate_rule(leaf("category", "neq", "sc"), PROFILE)
    assert result.result == FAIL
    assert result.missing_attributes == []


def test_neq_missing_attribute_is_unknown_and_listed():
    result = evaluate_rule(leaf("family_category", "neq", "sc"), PROFILE)
    assert result.result == UNKNOWN
    assert result.missing_attributes == ["family_category"]


def test_is_set_pass_when_value_present():
    result = evaluate_rule(leaf("category", "is_set"), PROFILE)
    assert result.result == PASS
    assert result.missing_attributes == []


@pytest.mark.parametrize(
    "profile",
    [{}, {"category": None}, {"category": ""}],
    ids=["absent", "none", "empty_string"],
)
def test_is_set_fail_when_absent_none_or_empty(profile):
    result = evaluate_rule(leaf("category", "is_set"), profile)
    assert result.result == FAIL
    assert result.missing_attributes == []


# ---------------------------------------------------------------------------
# Missing and unusable profile data
# ---------------------------------------------------------------------------

def test_missing_attribute_is_unknown_and_listed():
    result = evaluate_rule(leaf("family_income", "lt", 100000), PROFILE)
    assert result.result == UNKNOWN
    assert result.missing_attributes == ["family_income"]


def test_none_value_is_treated_as_missing():
    result = evaluate_rule(leaf("income", "lt", 100000), {"income": None})
    assert result.result == UNKNOWN
    assert result.missing_attributes == ["income"]


@pytest.mark.parametrize(
    "node, raw",
    [
        (leaf("income", "lt", 100000), "abc"),          # numeric op, non-numeric text
        (leaf("category", "in", ["sc"]), ["sc"]),        # list is not comparable
        (leaf("hostel", "is_true"), "yes"),              # bool op, non-bool
    ],
)
def test_bad_type_is_unknown_not_an_exception(node, raw):
    key = node["attr"]
    result = evaluate_rule(node, {key: raw})
    assert result.result == UNKNOWN
    assert result.explanation == f"value for {key} is not usable"


def test_numeric_string_from_extraction_is_accepted():
    result = evaluate_rule(leaf("income", "lt", 60000), {"income": "45000"})
    assert result.result == PASS


# ---------------------------------------------------------------------------
# AND / OR truth tables with UNKNOWN
# ---------------------------------------------------------------------------

_KIND_LEAF = {
    "P": ("yes", True),
    "F": ("no", False),
    "U": ("missing_attr", None),
}


def _pair_profile():
    return {"yes": True, "no": False}


def _kind_leaf(kind):
    attr, _ = _KIND_LEAF[kind]
    return {"attr": attr, "op": "is_true", "label": f"{kind} leaf"}


@pytest.mark.parametrize(
    "left, right, expected",
    [
        ("P", "P", PASS),
        ("P", "F", FAIL),
        ("P", "U", UNKNOWN),
        ("F", "P", FAIL),
        ("F", "F", FAIL),
        ("F", "U", FAIL),
        ("U", "P", UNKNOWN),
        ("U", "F", FAIL),
        ("U", "U", UNKNOWN),
    ],
)
def test_and_truth_table(left, right, expected):
    node = {"all": [_kind_leaf(left), _kind_leaf(right)]}
    assert evaluate_rule(node, _pair_profile()).result == expected


@pytest.mark.parametrize(
    "left, right, expected",
    [
        ("P", "P", PASS),
        ("P", "F", PASS),
        ("P", "U", PASS),
        ("F", "P", PASS),
        ("F", "F", FAIL),
        ("F", "U", UNKNOWN),
        ("U", "P", PASS),
        ("U", "F", UNKNOWN),
        ("U", "U", UNKNOWN),
    ],
)
def test_or_truth_table(left, right, expected):
    node = {"any": [_kind_leaf(left), _kind_leaf(right)]}
    assert evaluate_rule(node, _pair_profile()).result == expected


def test_combined_missing_attributes_are_sorted_union():
    node = {
        "all": [
            leaf("zeta_attr", "lt", 5),
            {"any": [leaf("alpha_attr", "gt", 1), leaf("zeta_attr", "gt", 1)]},
        ]
    }
    result = evaluate_rule(node, {})
    assert result.result == UNKNOWN
    assert result.missing_attributes == ["alpha_attr", "zeta_attr"]


# ---------------------------------------------------------------------------
# Conditionals
# ---------------------------------------------------------------------------

def test_conditional_applies_and_takes_then_result_fail():
    node = {
        "if": leaf("hostel", "is_true"),
        "then": leaf("income", "lt", 10000),
    }
    result = evaluate_rule(node, PROFILE)
    assert result.result == FAIL


def test_conditional_applies_and_takes_then_result_pass():
    node = {
        "if": leaf("hostel", "is_true"),
        "then": leaf("income", "lt", 60000),
    }
    assert evaluate_rule(node, PROFILE).result == PASS


def test_conditional_not_applicable_when_condition_fails():
    node = {
        "if": leaf("tuition_paid", "is_true"),
        "then": leaf("income", "lt", 10000),
    }
    result = evaluate_rule(node, PROFILE)
    assert result.result == PASS
    assert result.explanation == "not applicable"


def test_conditional_unknown_when_condition_unknown():
    node = {
        "if": leaf("disability_pct", "gte", 40),
        "then": leaf("income", "lt", 60000),
    }
    result = evaluate_rule(node, PROFILE)
    assert result.result == UNKNOWN
    assert result.missing_attributes == ["disability_pct"]


# ---------------------------------------------------------------------------
# Rule validation
# ---------------------------------------------------------------------------

def test_valid_nested_rule_has_no_errors():
    node = {
        "all": [
            leaf("income", "lte", 250000),
            {"any": [leaf("category", "in", ["sc", "st"]), leaf("hostel", "is_true")]},
            {"if": leaf("hostel", "is_true"), "then": leaf("income", "between", [0, 100])},
        ]
    }
    assert validate_rule(node) == []


@pytest.mark.parametrize(
    "node",
    [
        leaf("income", "approx", 5),                                  # unknown op
        {"attr": "income", "op": "lt", "value": 5},                   # missing label
        {"attr": "income", "op": "lt", "value": 5, "label": "  "},    # blank label
        {"all": []},                                                  # empty all
        leaf("Income", "lt", 5),                                      # bad key (uppercase)
        leaf("1income", "lt", 5),                                     # key starts with digit
        {"attr": "income", "op": "lt", "value": 5, "label": "x", "extra": 1},
        leaf("income", "between", [10, 5]),                           # low > high
        leaf("income", "lt", "5"),                                    # non-numeric value
        leaf("income", "lt", True),                                   # bool is not a number
        leaf("hostel", "is_true", True, label="hostel"),              # bool op with value
        {"all": [leaf("income", "lt", 5)], "any": [leaf("income", "lt", 5)]},
        {"if": leaf("hostel", "is_true")},                            # conditional without then
    ],
)
def test_invalid_rules_are_rejected(node):
    assert validate_rule(node) != []


def test_evaluate_rule_raises_for_invalid_rule():
    with pytest.raises(ValueError):
        evaluate_rule(leaf("income", "approx", 5), PROFILE)


# ---------------------------------------------------------------------------
# Scheme-level outcomes
# ---------------------------------------------------------------------------

def test_unpublished_scheme_is_unverified_with_no_rule_results():
    result = evaluate_scheme(
        "draft", "sv-1", [leaf("income", "lt", 60000)], PROFILE
    )
    assert result.outcome == UNVERIFIED
    assert result.rule_results == []
    assert result.reason == "scheme version is not published and verified"


def test_unpublished_scheme_is_not_validated_or_evaluated():
    # Invalid rules on an unpublished version must not raise: nothing is evaluated.
    result = evaluate_scheme("draft", "sv-2", [{"attr": "Bad"}], PROFILE)
    assert result.outcome == UNVERIFIED


def test_empty_rules_need_more_information():
    result = evaluate_scheme("published", "sv-3", [], PROFILE)
    assert result.outcome == NEED_MORE_INFORMATION
    assert result.reason == "no rules recorded"


def test_all_rules_pass_is_likely_eligible():
    rules = [leaf("income", "lte", 250000), leaf("hostel", "is_true")]
    result = evaluate_scheme("published", "sv-4", rules, PROFILE)
    assert result.outcome == LIKELY_ELIGIBLE
    assert [r.result for r in result.rule_results] == [PASS, PASS]


def test_any_rule_fail_is_not_eligible_even_with_unknown():
    rules = [leaf("family_income", "lt", 1), leaf("income", "gt", 999999)]
    result = evaluate_scheme("published", "sv-5", rules, PROFILE)
    assert result.outcome == NOT_ELIGIBLE


def test_unknown_without_fail_needs_more_information_and_lists_missing():
    rules = [leaf("family_income", "lt", 100000), leaf("income", "lte", 250000)]
    result = evaluate_scheme("published", "sv-6", rules, PROFILE)
    assert result.outcome == NEED_MORE_INFORMATION
    assert result.missing_attributes == ["family_income"]


def test_scheme_with_invalid_rule_raises_value_error():
    with pytest.raises(ValueError):
        evaluate_scheme("published", "sv-7", [leaf("income", "approx", 5)], PROFILE)


# ---------------------------------------------------------------------------
# Schema-shaped rules through the adapter (neq / is_set are no longer UNKNOWN)
# ---------------------------------------------------------------------------

def _schema_rule(*criteria):
    return {
        "format_version": 1,
        "academic_year": "2025-26",
        "root": {
            "type": "group",
            "operator": "AND",
            "children": [
                {
                    "type": "criterion",
                    "attribute": attribute,
                    "operator": operator,
                    "value": value,
                    "source_reference": f"{attribute} {operator}",
                }
                for attribute, operator, value in criteria
            ],
        },
    }


def test_schema_neq_and_is_set_evaluate_to_non_unknown():
    rule_json = _schema_rule(
        ("category", "neq", "obc"),   # PASS: sc differs from obc
        ("hostel", "is_set", None),   # PASS: hostel is True
        ("income", "neq", 50000),     # FAIL: income equals 50000
    )
    node = adapt_rule_document(rule_json)
    assert evaluate_rule(node["all"][0], PROFILE).result == PASS
    assert evaluate_rule(node["all"][1], PROFILE).result == PASS
    assert evaluate_rule(node["all"][2], PROFILE).result == FAIL

    scheme = evaluate_scheme("published", "sv-8", node["all"], PROFILE)
    assert scheme.outcome == NOT_ELIGIBLE
    assert UNKNOWN not in [r.result for r in scheme.rule_results]


def test_schema_is_set_on_absent_attribute_is_fail_not_unknown():
    node = adapt_rule_document(_schema_rule(("family_income", "is_set", None)))
    result = evaluate_rule(node, PROFILE)
    assert result.result == FAIL
    assert result.missing_attributes == []
