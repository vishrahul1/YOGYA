# Eligibility Rule Format (Spec v1)

Status: draft. Items marked TBD are pending decisions and must not be guessed. Source of truth for product facts: `YOGYA_Complete_PRD.docx`.

## 1. Versioning

- `rule_format_version` starts at `1`.
- Every rule JSON document carries `format_version` (integer).
- Any semantic change to node types, operators, outcomes, or logic requires a new version number.

## 2. Node types

Every rule is a tree of nodes. Each node has a `type`.

**group**
- `type`: `"group"`
- `operator`: `"AND"` or `"OR"`
- `children`: non-empty array of nodes.

**criterion**
- `type`: `"criterion"`
- `attribute`: must match `^[a-z][a-z0-9_]*$` and be listed in the profile attribute registry (registry contents: TBD).
- `operator`: one of `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`, `not_in`, `between`, `is_set`.
- `value`: shape depends on operator (see section 8).
- `academic_year`: format `YYYY-YY` (e.g. `2030-31`).
- `source_reference`: UUID of a `scheme_sources` row.
- `unknown_policy`: `"UNKNOWN"`. This is the only allowed value for now.

**conditional**
- `type`: `"conditional"`
- `if`: a node (criterion or group).
- `then`: a node (criterion or group).

## 3. Outcomes

Each node evaluates to `PASS`, `FAIL`, or `UNKNOWN`.

- **Criterion:**
  - Attribute missing or null -> `UNKNOWN`.
  - Otherwise compare the profile value with `value` -> `PASS` or `FAIL`.
  - Type mismatch between profile value and criterion -> `UNKNOWN`, with a reason code (reason-code list: TBD).
- **FAIL-on-missing** is not permitted. Any such policy requires a separate decision (TBD).

## 4. Three-valued logic

- **AND:** any child `FAIL` -> `FAIL`; else any child `UNKNOWN` -> `UNKNOWN`; else `PASS`.
- **OR:** any child `PASS` -> `PASS`; else any child `UNKNOWN` -> `UNKNOWN`; else `FAIL`.

## 5. Conditional

- `if` = `PASS` -> result is the `then` node's result.
- `if` = `FAIL` -> node is **NOT APPLICABLE**: excluded from its parent. (DECISION TO CONFIRM.)
- `if` = `UNKNOWN` -> result is `UNKNOWN`.
- Behaviour when every child of a parent is NOT APPLICABLE: TBD (pending decision).

## 6. Academic year

- A criterion's `academic_year` must equal the `academic_year` of its scheme version.
- A mismatch is a **publish-time validation error**, not an evaluation outcome.

## 7. Sources and publication

- Every criterion references exactly one `scheme_sources` id via `source_reference`.
- Only `scheme_versions` with `status = 'published'` are eligible for authoritative matching.
- Publication requires that all rules reference sources.

## 8. Validation

- Unknown operator: rejected.
- `in` / `not_in`: `value` must be a non-empty array.
- `between`: `value` must be exactly two numbers `[min, max]` with `min <= max`.
- `is_set`: takes no `value` (value must be absent).
- Maximum tree depth and maximum criteria per rule: TBD.

## 9. Worked example

### EXAMPLE ONLY - NOT A REAL SCHEME

All identifiers and values below are illustrative placeholders. They are not real scheme data, attributes, or thresholds.

- `scheme id`: `00000000-0000-0000-0000-000000000000`
- `academic_year`: `2030-31`
- Placeholder attributes: `example_income_band` (`in`), `example_age` (`between` `[16, 30]`), `example_category` (`in`).
- `source_reference` value below is a placeholder UUID `00000000-0000-0000-0000-000000000001`.

```json
{
  "format_version": 1,
  "scheme_id": "00000000-0000-0000-0000-000000000000",
  "academic_year": "2030-31",
  "rule": {
    "type": "group",
    "operator": "AND",
    "children": [
      {
        "type": "group",
        "operator": "OR",
        "children": [
          {
            "type": "criterion",
            "attribute": "example_income_band",
            "operator": "in",
            "value": ["BAND_A", "BAND_B"],
            "academic_year": "2030-31",
            "source_reference": "00000000-0000-0000-0000-000000000001",
            "unknown_policy": "UNKNOWN"
          },
          {
            "type": "criterion",
            "attribute": "example_category",
            "operator": "in",
            "value": ["CAT_X"],
            "academic_year": "2030-31",
            "source_reference": "00000000-0000-0000-0000-000000000001",
            "unknown_policy": "UNKNOWN"
          }
        ]
      },
      {
        "type": "criterion",
        "attribute": "example_age",
        "operator": "between",
        "value": [16, 30],
        "academic_year": "2030-31",
        "source_reference": "00000000-0000-0000-0000-000000000001",
        "unknown_policy": "UNKNOWN"
      },
      {
        "type": "conditional",
        "if": {
          "type": "criterion",
          "attribute": "example_category",
          "operator": "in",
          "value": ["CAT_X"],
          "academic_year": "2030-31",
          "source_reference": "00000000-0000-0000-0000-000000000001",
          "unknown_policy": "UNKNOWN"
        },
        "then": {
          "type": "criterion",
          "attribute": "example_income_band",
          "operator": "in",
          "value": ["BAND_A"],
          "academic_year": "2030-31",
          "source_reference": "00000000-0000-0000-0000-000000000001",
          "unknown_policy": "UNKNOWN"
        }
      }
    ]
  }
}
```

Illustrative outcomes (placeholder profiles):

| Profile | Input (placeholder) | Result | Reason |
|---|---|---|---|
| A | all attributes present and satisfying (`example_income_band` = BAND_A, `example_category` = CAT_X, `example_age` = 20) | PASS | every branch passes |
| B | `example_age` missing; others as in A | UNKNOWN | AND has no FAIL and one UNKNOWN |
| C | `example_income_band` = BAND_C (out of set); `example_category` = CAT_X; `example_age` = 20 | FAIL | conditional `then` fails, so AND fails |

## 10. Pending decisions (TBD)

1. Attribute registry contents.
2. FAIL-on-missing policy (not permitted without a decision).
3. Not-applicable semantics, including the case where every child of a parent is not applicable (section 5).
4. Maximum tree depth and maximum criteria per rule (section 8).
5. Reason-code list (section 3).
6. Whether benefit amounts are represented in the rule format. Proposed: no. Benefits come from source text (TBD).
