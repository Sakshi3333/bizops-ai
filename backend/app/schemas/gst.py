"""Field types shared by every schema that carries GST details."""

from typing import Annotated

from pydantic import AfterValidator, Field

from app.services.gst import STATES, validate_gstin


def _validate_state_code(value: str) -> str:
    if value not in STATES:
        raise ValueError(f"Unknown GST state code '{value}'")
    return value


Gstin = Annotated[str, AfterValidator(validate_gstin)]
StateCode = Annotated[str, AfterValidator(_validate_state_code)]
# HSN (goods) is 4, 6 or 8 digits; SAC (services) is 6.
HsnCode = Annotated[str, Field(pattern=r"^\d{4,8}$")]
