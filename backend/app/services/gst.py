"""Indian GST rules: GSTIN validation, state codes and the CGST/SGST/IGST split.

Pure functions with no database access, so the router, the PDF renderer and the
demo seed all share one implementation (and it can be unit-tested on its own).
"""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# GST state codes: the first two digits of every GSTIN, and how place of supply is recorded.
STATES: dict[str, str] = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman and Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh",
    "97": "Other Territory",
}

_GSTIN_PATTERN = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_PAISA = Decimal("0.01")


def state_name(code: str | None) -> str | None:
    return STATES.get(code) if code else None


def gstin_check_digit(first_14: str) -> str:
    """The 15th character of a GSTIN: a mod-36 checksum over the first fourteen."""
    total = 0
    for index, char in enumerate(first_14):
        product = _GSTIN_ALPHABET.index(char) * (2 if index % 2 else 1)
        total += product // 36 + product % 36
    return _GSTIN_ALPHABET[(36 - total % 36) % 36]


def validate_gstin(value: str) -> str:
    """Returns the normalised (upper-case) GSTIN, or raises ValueError saying what is wrong."""
    gstin = value.strip().upper()
    if not _GSTIN_PATTERN.match(gstin):
        raise ValueError("GSTIN must be 15 characters, like 27ABCDE1234F1Z5")
    if gstin[:2] not in STATES:
        raise ValueError(f"GSTIN starts with an unknown state code '{gstin[:2]}'")
    if gstin_check_digit(gstin[:14]) != gstin[14]:
        raise ValueError("GSTIN check digit does not match - please re-check for typos")
    return gstin


def resolve_gst_identity(gstin: str | None, state_code: str | None) -> tuple[str | None, str | None]:
    """A GSTIN fixes the state (its first two digits); without one the state stands alone.

    Raises ValueError if both are given and disagree.
    """
    if gstin is None:
        return None, state_code
    gstin_state = gstin[:2]
    if state_code is not None and state_code != gstin_state:
        raise ValueError(
            f"State ({STATES.get(state_code, state_code)}) does not match the GSTIN's state "
            f"({STATES.get(gstin_state, gstin_state)})"
        )
    return gstin, gstin_state


def merge_gst_identity(
    current_gstin: str | None, current_state_code: str | None, changes: dict
) -> tuple[str | None, str | None]:
    """GSTIN and state after applying a partial update (a PATCH body's set fields).

    A new GSTIN re-derives the state unless the same update also sets one, in
    which case the two must agree. Raises ValueError if they do not.
    """
    gstin = changes.get("gstin", current_gstin)
    if "state_code" in changes:
        state_code = changes["state_code"]
    elif changes.get("gstin"):
        state_code = None
    else:
        state_code = current_state_code
    return resolve_gst_identity(gstin, state_code)


@dataclass(frozen=True)
class LineTax:
    cgst: Decimal
    sgst: Decimal
    igst: Decimal

    @property
    def total(self) -> Decimal:
        return self.cgst + self.sgst + self.igst


def _round(amount: Decimal) -> Decimal:
    return amount.quantize(_PAISA, rounding=ROUND_HALF_UP)


def line_tax(taxable_value: Decimal, rate_percent: Decimal, *, interstate: bool) -> LineTax:
    """GST on one line. Within a state the rate is split equally into CGST and SGST
    (each rounded on its own, so the two halves always match); across states it is
    charged whole as IGST."""
    zero = Decimal("0.00")
    if interstate:
        return LineTax(cgst=zero, sgst=zero, igst=_round(taxable_value * rate_percent / 100))
    half = _round(taxable_value * rate_percent / 200)
    return LineTax(cgst=half, sgst=half, igst=zero)


_ONES = (
    "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen "
    "Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen"
).split()
_TENS = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()


def _words_below_1000(number: int) -> str:
    parts = []
    if number >= 100:
        parts.append(f"{_ONES[number // 100]} Hundred")
        number %= 100
    if number >= 20:
        parts.append(_TENS[number // 10] + (f" {_ONES[number % 10]}" if number % 10 else ""))
    elif number or not parts:
        parts.append(_ONES[number])
    return " ".join(parts)


def _indian_words(number: int) -> str:
    if number == 0:
        return "Zero"
    parts = []
    crore, number = divmod(number, 10_000_000)
    lakh, number = divmod(number, 100_000)
    thousand, number = divmod(number, 1_000)
    if crore:
        parts.append(f"{_indian_words(crore)} Crore")
    if lakh:
        parts.append(f"{_words_below_1000(lakh)} Lakh")
    if thousand:
        parts.append(f"{_words_below_1000(thousand)} Thousand")
    if number:
        parts.append(_words_below_1000(number))
    return " ".join(parts)


def rupees_in_words(amount: Decimal) -> str:
    """'Rupees One Lakh Five Thousand and Fifty Paise Only' - Indian numbering (lakh, crore)."""
    rupees, paise = divmod(int(_round(amount) * 100), 100)
    words = f"Rupees {_indian_words(rupees)}"
    if paise:
        words += f" and {_words_below_1000(paise)} Paise"
    return f"{words} Only"
