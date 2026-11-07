"""DTO for user login requests.

Validates the incoming login payload:
- ``email`` must be a valid e-mail address.
- ``password`` must be a non-empty string (after stripping whitespace).

Example
-------
>>> from auth.dto.login_dto import LoginDTO
>>> dto = LoginDTO(email="user@example.com", password="Secret1234")
>>> dto.email
'user@example.com'
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator


class LoginDTO(BaseModel):
    """Pydantic schema for the ``POST /auth/login`` request body."""

    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        """Ensure the password field is not empty.

        Raises
        ------
        ValueError
            If the password is blank after stripping whitespace.
        """
        if not value.strip():
            raise ValueError("Password must not be empty.")
        if len(value) > 128:
            raise ValueError("Password must not exceed 128 characters.")
        return value
