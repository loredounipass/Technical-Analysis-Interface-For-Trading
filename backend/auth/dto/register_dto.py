"""DTO for user registration requests.

Validates and normalises the incoming registration payload:
- ``email`` must be a valid e-mail address (RFC 5322 via *email-validator*).
- ``username`` must be 3–30 alphanumeric/underscore/hyphen characters and is
  lowercased automatically.
- ``password`` must be at least 8 characters and contain at least one
  uppercase letter, one lowercase letter, and one digit.

Example
-------
>>> from auth.dto.register_dto import RegisterDTO
>>> dto = RegisterDTO(
...     email="user@example.com",
...     username="Cool_User",
...     password="Secret1234",
... )
>>> dto.username
'cool_user'
"""

from __future__ import annotations

import re

from pydantic import BaseModel, EmailStr, field_validator
from auth.constants import MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH


class RegisterDTO(BaseModel):
    """Pydantic schema for the ``POST /auth/register`` request body."""

    email: EmailStr
    username: str
    password: str

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str) -> str:
        """Strip whitespace, enforce length/charset, and lowercase.

        Rules
        -----
        - Must be between 3 and 30 characters (after stripping).
        - Only ASCII letters, digits, underscores, and hyphens are allowed.
        - Stored in lowercase to guarantee case-insensitive uniqueness.

        Raises
        ------
        ValueError
            If the value violates any of the above constraints.
        """
        value = value.strip()
        if len(value) < 3 or len(value) > 30:
            raise ValueError(
                "Username must be between 3 and 30 characters."
            )
        if not re.fullmatch(r"^[a-zA-Z0-9_-]+$", value):
            raise ValueError(
                "Username may only contain letters, digits, underscores, "
                "and hyphens."
            )
        return value.lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        """Enforce strong password complexity.

        Rules
        -----
        - Between 8 and 72 characters long (72 is bcrypt's truncation boundary).
        - Contains at least one uppercase letter (A–Z).
        - Contains at least one lowercase letter (a–z).
        - Contains at least one digit (0–9).
        - Contains at least one special character / symbol (e.g. !@#$%^&*).

        Raises
        ------
        ValueError
            If the value violates any of the above constraints.
        """
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long.")
        if len(value) > MAX_PASSWORD_LENGTH:
            raise ValueError(f"Password must not exceed {MAX_PASSWORD_LENGTH} characters.")
        if not re.search(r"[A-Z]", value):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", value):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", value):
            raise ValueError("Password must contain at least one digit.")
        if not re.search(r"""[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`'"\\^]""", value):
            raise ValueError("Password must contain at least one special character or symbol (e.g. !@#$%^&*).")
        return value
