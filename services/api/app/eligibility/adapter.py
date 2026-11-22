"""Adapter from schema-shaped rule_json (format v1) to the engine's node shape.

Pure translation with no database or network access. Every schema operator maps
directly to an engine operator. scrub_profile() removes reserved unsupported-operator
keys from incoming profiles so a client cannot inject them.
"""

from __future__ import annotations

from typing import Any

FORMAT_VERSION = 1

# Reserved attribute prefix for unsupported-operator leaves (no longer produced;
# kept so scrub_profile() still strips such keys from client profiles).
UNSUPPORTED_PREFIX = "unsupported_op_"

_OPERATOR_MAP: dict[str, str] = {
    "eq": "eq",
    "neq": "neq",
    "is_set": "is_set",
    "lt": "lt",
    "lte": "lte",
    "gt": "gt",
    "gte": "gte",
    "in": "in",
    "not_in": "not_in",
    "between": "between",
}

_GROUP_MAP: dict[str, str] = {"AND": "all", "OR": "any"}


def adapt_rule_document(rule_json: Any) -> dict[str, Any]:
    """Convert a stored rule document (format_version, academic_year, root) to engine shape."""
    if not isinstance(rule_json, dict):
        raise ValueError("rule document must be an object")
    if rule_json.get("format_version") != FORMAT_VERSION:
        raise ValueError("unsupported rule format_version")
    if "root" not in rule_json:
        raise ValueError("rule document has no root node")
    return adapt_node(rule_json["root"])


def adapt_node(node: Any) -> dict[str, Any]:
    """Convert one schema node (group, criterion or conditional) to engine shape."""
    if not isinstance(node, dict):
        raise ValueError("rule node must be an object")
    node_type = node.get("type")
    if node_type == "group":
        return _adapt_group(node)
    if node_type == "criterion":
        return _adapt_criterion(node)
    if node_type == "conditional":
        if "if" not in node or "then" not in node:
            raise ValueError("conditional requires 'if' and 'then'")
        return {"if": adapt_node(node["if"]), "then": adapt_node(node["then"])}
    raise ValueError(f"unknown rule node type {node_type!r}")


def _adapt_group(node: dict[str, Any]) -> dict[str, Any]:
    key = _GROUP_MAP.get(node.get("operator"))  # type: ignore[arg-type]
    if key is None:
        raise ValueError(f"unknown group operator {node.get('operator')!r}")
    children = node.get("children")
    if not isinstance(children, list):
        raise ValueError("group children must be a list")
    return {key: [adapt_node(child) for child in children]}


def _adapt_criterion(node: dict[str, Any]) -> dict[str, Any]:
    operator = node.get("operator")
    label = node.get("source_reference")

    engine_op = _OPERATOR_MAP.get(operator)  # type: ignore[arg-type]
    if engine_op is None:
        raise ValueError(f"unknown criterion operator {operator!r}")
    leaf: dict[str, Any] = {
        "attr": node.get("attribute"),
        "op": engine_op,
        "label": label,
    }
    if engine_op != "is_set":
        leaf["value"] = node.get("value")
    return leaf


def scrub_profile(profile: Any) -> dict[str, Any]:
    """Return a copy of profile without reserved unsupported-operator keys."""
    if not isinstance(profile, dict):
        return {}
    return {
        key: value
        for key, value in profile.items()
        if not (isinstance(key, str) and key.startswith(UNSUPPORTED_PREFIX))
    }
