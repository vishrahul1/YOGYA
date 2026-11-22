"""Deterministic profile extraction from free text (English and Telugu).

Pure Python, no network. Only keys that are clearly present are returned;
nothing is invented.
"""

import re

REQUIRED_KEYS = [
    "age",
    "annual_family_income_inr",
    "caste_category",
    "gender",
    "district",
    "course_level",
]

FOLLOWUP_TEMPLATES = {
    "age": {
        "en": "What is your age?",
        "te": "మీ వయస్సు ఎంత?",
    },
    "annual_family_income_inr": {
        "en": "What is your family's annual income in rupees?",
        "te": "మీ కుటుంబ వార్షిక ఆదాయం ఎంత?",
    },
    "caste_category": {
        "en": "What is your caste category (SC, ST, BC, OC, EWS or Minority)?",
        "te": "మీ కులవర్గం ఏమిటి (SC, ST, BC, OC, EWS లేదా మైనారిటీ)?",
    },
    "gender": {
        "en": "What is your gender?",
        "te": "మీ లింగం ఏమిటి?",
    },
    "district": {
        "en": "Which district do you live in?",
        "te": "మీరు ఏ జిల్లాలో నివసిస్తున్నారు?",
    },
    "course_level": {
        "en": "Which course are you currently studying?",
        "te": "మీరు ప్రస్తుతం ఏ కోర్సు చదువుతున్నారు?",
    },
}

DISTRICTS = [
    "Warangal",
    "Hyderabad",
    "Karimnagar",
    "Nizamabad",
    "Khammam",
    "Nalgonda",
    "Rangareddy",
    "Medak",
    "Mahbubnagar",
    "Adilabad",
]

_TELUGU_DIGITS = {0x0C66 + i: str(i) for i in range(10)}

_AGE_PATTERNS = [
    re.compile(r"\b(\d{1,3})\s*(?:years?|yrs?)\s*old\b", re.IGNORECASE),
    re.compile(r"\bage\s*(?:is|:)?\s*(\d{1,3})\b", re.IGNORECASE),
    re.compile(r"(\d{1,3})\s*ఏళ్"),
]
_LAKH_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:lakhs?|లక్షలు|లక్ష)", re.IGNORECASE)
_INCOME_PLAIN_RE = re.compile(r"income\D{0,20}?(\d[\d,]*)", re.IGNORECASE)
_CASTE_RE = re.compile(r"\b(SC|ST|BC|OC|EWS|MINORITY)\b", re.IGNORECASE)
_FEMALE_RE = re.compile(r"\b(female|woman|girl)s?\b", re.IGNORECASE)
_MALE_RE = re.compile(r"\b(male|man|boy)s?\b", re.IGNORECASE)
_OTHER_GENDER_RE = re.compile(r"\b(transgender|non-binary)\b", re.IGNORECASE)
_COURSE_PATTERNS = [
    ("postgraduate", re.compile(r"\b(master|masters|msc|m\.?sc|mba|m\.?tech|postgraduate)\b", re.IGNORECASE)),
    ("undergraduate", re.compile(r"\b(degree|b\.?tech|b\.?sc|b\.?com|btech|undergraduate)\b", re.IGNORECASE)),
    ("intermediate", re.compile(r"\b(inter|intermediate)\b", re.IGNORECASE)),
]
_DISABILITY_RE = re.compile(r"\b(disability|handicap|handicapped)\b", re.IGNORECASE)
_DISABILITY_NEGATED_RE = re.compile(
    r"\b(no|not|without|none)\b[^.]{0,20}\b(disability|handicap|handicapped)\b",
    re.IGNORECASE,
)


def _normalise(text: str) -> str:
    """Convert Telugu digits to ASCII digits."""
    return text.translate(_TELUGU_DIGITS)


def _extract_age(text: str):
    for pattern in _AGE_PATTERNS:
        match = pattern.search(text)
        if match:
            value = int(match.group(1))
            if 0 <= value <= 120:
                return value
    return None


def _extract_income(text: str):
    match = _LAKH_RE.search(text)
    if match:
        return int(float(match.group(1)) * 100000)
    match = _INCOME_PLAIN_RE.search(text)
    if match:
        digits = match.group(1).replace(",", "")
        if digits.isdigit():
            return int(digits)
    return None


def _extract_caste(text: str):
    match = _CASTE_RE.search(text)
    return match.group(1).upper() if match else None


def _extract_gender(text: str):
    if _FEMALE_RE.search(text) or "ఆడ" in text:
        return "female"
    if _MALE_RE.search(text) or "మగ" in text:
        return "male"
    if _OTHER_GENDER_RE.search(text):
        return "other"
    return None


def _extract_district(text: str):
    for name in DISTRICTS:
        if re.search(r"\b" + re.escape(name) + r"\b", text, re.IGNORECASE):
            return name
    return None


def _extract_course(text: str):
    for level, pattern in _COURSE_PATTERNS:
        if pattern.search(text):
            return level
    return None


def _extract_disability(text: str):
    if not _DISABILITY_RE.search(text):
        return None
    if _DISABILITY_NEGATED_RE.search(text):
        return None
    return True


def extract_profile_deterministic(text: str, language: str) -> dict:
    """Extract a profile dict, missing required keys and follow-up questions.

    `language` is accepted for interface parity; extraction is script-based.
    """
    normalised = _normalise(text)
    profile = {}

    age = _extract_age(normalised)
    if age is not None:
        profile["age"] = age

    income = _extract_income(normalised)
    if income is not None:
        profile["annual_family_income_inr"] = income

    caste = _extract_caste(normalised)
    if caste is not None:
        profile["caste_category"] = caste

    gender = _extract_gender(normalised)
    if gender is not None:
        profile["gender"] = gender

    district = _extract_district(normalised)
    if district is not None:
        profile["district"] = district

    course = _extract_course(normalised)
    if course is not None:
        profile["course_level"] = course

    disability = _extract_disability(normalised)
    if disability is not None:
        profile["disability"] = disability

    missing = [key for key in REQUIRED_KEYS if key not in profile]
    followup_questions = [
        {"key": key, "en": FOLLOWUP_TEMPLATES[key]["en"], "te": FOLLOWUP_TEMPLATES[key]["te"]}
        for key in missing
    ]
    return {"profile": profile, "missing": missing, "followup_questions": followup_questions}
