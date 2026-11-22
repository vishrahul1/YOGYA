"""Grounded explanation builder.

Only uses the rule labels and explanations supplied in the result dict, plus
fixed outcome phrases. Nothing is generated beyond that.
"""

OUTCOME_PHRASES = {
    "en": {
        "LIKELY_ELIGIBLE": "Based on the information provided, you are likely eligible for {scheme}.",
        "NOT_ELIGIBLE": "Based on the information provided, you do not appear to be eligible for {scheme}.",
        "NEED_MORE_INFORMATION": "More information is needed to assess your eligibility for {scheme}.",
        "UNVERIFIED": "Eligibility for {scheme} could not be verified from the available rules.",
    },
    "te": {
        "LIKELY_ELIGIBLE": "అందించిన సమాచారం ఆధారంగా మీరు {scheme} కు అర్హులయ్యే అవకాశం ఉంది.",
        "NOT_ELIGIBLE": "అందించిన సమాచారం ఆధారంగా మీరు {scheme} కు అర్హులుగా కనిపించడం లేదు.",
        "NEED_MORE_INFORMATION": "{scheme} కు మీ అర్హతను నిర్ణయించడానికి మరింత సమాచారం అవసరం.",
        "UNVERIFIED": "{scheme} కు అర్హతను అందుబాటులో ఉన్న నియమాలతో ధృవీకరించలేకపోయాము.",
    },
}

DISCLAIMER = {
    "en": "Final eligibility is confirmed on the official portal.",
    "te": "తుది అర్హత అధికారిక పోర్టల్‌లో నిర్ధారించబడుతుంది.",
}


def build_explanation(result: dict, language: str) -> str:
    """Build a grounded explanation string in English ("en") or Telugu ("te")."""
    if language not in OUTCOME_PHRASES:
        raise ValueError(f"Unsupported language: {language!r}")
    outcome = result.get("outcome")
    phrases = OUTCOME_PHRASES[language]
    if outcome not in phrases:
        raise ValueError(f"Unknown outcome: {outcome!r}")

    scheme = result.get("scheme_name", "")
    parts = [phrases[outcome].format(scheme=scheme)]
    for rule in result.get("rule_results", []):
        label = rule.get("rule_label", "")
        verdict = rule.get("result", "")
        explanation = rule.get("explanation", "")
        parts.append(f"{label} ({verdict}): {explanation}")
    parts.append(DISCLAIMER[language])
    return " ".join(parts)
