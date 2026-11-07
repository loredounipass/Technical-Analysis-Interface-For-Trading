"""DTO for token refresh requests.

Validates the incoming refresh-token payload:
- ``refresh_token`` must be a non-empty string (after stripping whitespace).

Example
-------
>>> from auth.dto.refresh_token_dto import RefreshTokenDTO
>>> dto = RefreshTokenDTO(refresh_token="eyJhbGci...")
>>> dto.refresh_token
'eyJhbGci...'
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator


class RefreshTokenDTO(BaseModel):
    """Pydantic schema for the ``POST /auth/refresh`` request body."""

    refresh_token: str

    @field_validator("refresh_token")
    @classmethod
    def validate_refresh_token(cls, value: str) -> str:
        """Ensure the refresh token field is not empty.

        Raises
        ------
        ValueError
            If the token is blank after stripping whitespace.
        """
        if not value.strip():
            raise ValueError("Refresh token must not be empty.")
        return value
