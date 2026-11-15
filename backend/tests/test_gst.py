from decimal import Decimal

import pytest

from app.services.gst import (
    gstin_check_digit,
    line_tax,
    merge_gst_identity,
    resolve_gst_identity,
    rupees_in_words,
    validate_gstin,
)

# A GSTIN widely published as a format example; its check digit is genuine.
VALID_GSTIN = "27AAPFU0939F1ZV"


def test_valid_gstin_is_accepted_and_normalised():
    assert validate_gstin(" 27aapfu0939f1zv ") == VALID_GSTIN


def test_check_digit_matches_known_gstin():
    assert gstin_check_digit(VALID_GSTIN[:14]) == "V"


@pytest.mark.parametrize(
    "bad, message",
    [
        ("27AAPFU0939F1Z", "15 characters"),  # too short
        ("27AAPFU0939F1YV", "15 characters"),  # 14th character must be Z
        ("99AAPFU0939F1ZV", "unknown state code"),
        ("27AAPFU0939F1ZX", "check digit"),  # single-character typo
        ("27AAPFU0993F1ZV", "check digit"),  # two digits swapped
    ],
)
def test_invalid_gstin_is_rejected(bad, message):
    with pytest.raises(ValueError, match=message):
        validate_gstin(bad)


def test_gstin_fixes_the_state():
    assert resolve_gst_identity(VALID_GSTIN, None) == (VALID_GSTIN, "27")
    assert resolve_gst_identity(VALID_GSTIN, "27") == (VALID_GSTIN, "27")
    assert resolve_gst_identity(None, "29") == (None, "29")
    with pytest.raises(ValueError, match="does not match"):
        resolve_gst_identity(VALID_GSTIN, "29")


def test_merging_a_partial_update():
    # A new GSTIN replaces the old state...
    assert merge_gst_identity(None, "29", {"gstin": VALID_GSTIN}) == (VALID_GSTIN, "27")
    # ...clearing the GSTIN keeps the state...
    assert merge_gst_identity(VALID_GSTIN, "27", {"gstin": None}) == (None, "27")
    # ...and the state alone cannot contradict an existing GSTIN.
    with pytest.raises(ValueError):
        merge_gst_identity(VALID_GSTIN, "27", {"state_code": "29"})
    assert merge_gst_identity(None, "27", {"name": "x"}) == (None, "27")


def test_intrastate_tax_splits_into_equal_halves():
    tax = line_tax(Decimal("1000.00"), Decimal("18"), interstate=False)
    assert (tax.cgst, tax.sgst, tax.igst) == (Decimal("90.00"), Decimal("90.00"), Decimal("0.00"))
    assert tax.total == Decimal("180.00")


def test_interstate_tax_is_all_igst():
    tax = line_tax(Decimal("1000.00"), Decimal("18"), interstate=True)
    assert (tax.cgst, tax.sgst, tax.igst) == (Decimal("0.00"), Decimal("0.00"), Decimal("180.00"))


def test_halves_stay_equal_when_rounding():
    # 5% of 33.30 is 1.665: each half is 0.8325 -> 0.83, never 0.83 + 0.84.
    tax = line_tax(Decimal("33.30"), Decimal("5"), interstate=False)
    assert tax.cgst == tax.sgst == Decimal("0.83")


@pytest.mark.parametrize(
    "amount, words",
    [
        ("0", "Rupees Zero Only"),
        ("19", "Rupees Nineteen Only"),
        ("1180.00", "Rupees One Thousand One Hundred Eighty Only"),
        ("105000.50", "Rupees One Lakh Five Thousand and Fifty Paise Only"),
        ("12345678.09", "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Nine Paise Only"),
        ("1000000000", "Rupees One Hundred Crore Only"),
    ],
)
def test_rupees_in_words(amount, words):
    assert rupees_in_words(Decimal(amount)) == words
