"""Redaction of sensitive identifiers before any text leaves the service.

Stdlib only. Patterns are applied to ASCII digits/letters; non-ASCII text
(for example Telugu script) passes through unchanged.
"""

import re

REDACTED_ID = "[REDACTED_ID]"
REDACTED_PHONE = "[REDACTED_PHONE]"

# 12-digit Aadhaar-like run: plain, space-separated or hyphen-separated.
_AADHAAR_RE = re.compile(r"(?<![0-9])[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{4}(?![0-9])")
# PAN: five letters, four digits, one letter.
_PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
# 10-digit Indian mobile number starting with 6-9.
_PHONE_RE = re.compile(r"(?<![0-9])[6-9][0-9]{9}(?![0-9])")


def redact(text: str) -> str:
    """Return text with Aadhaar-like numbers, PAN and mobile numbers masked."""
    out = _AADHAAR_RE.sub(REDACTED_ID, text)
    out = _PAN_RE.sub(REDACTED_ID, out)
    out = _PHONE_RE.sub(REDACTED_PHONE, out)
    return out


def contains_sensitive_id(text: str) -> bool:
    """True if any sensitive identifier pattern matches the given text."""
    return any(p.search(text) for p in (_AADHAAR_RE, _PAN_RE, _PHONE_RE))
