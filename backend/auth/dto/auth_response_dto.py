"""DTOs for authentication responses.

Provides two Pydantic models that serialise the data returned after a
successful login, registration, or token refresh:

- :class:`UserResponseDTO` — public-safe subset of user fields.
- :class:`AuthResponseDTO` — tokens + user info sent back to the client.

Example
-------
>>> from auth.dto.auth_response_dto import AuthResponseDTO
>>> response = AuthResponseDTO.from_user_and_tokens(
...     user={
...         "id": "a1b2c3d4-...",
...         "email": "user@example.com",
...         "username": "cool_user",
...         "is_active": True,
...         "created_at": "2024-01-15T10:30:00",
...     },
...     tokens={
...         "access_token": "eyJ...",
...         "refresh_token": "eyJ...",
...         "expires_in": 900,
...     },
... )
>>> response.token_type
'Bearer'
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserResponseDTO(BaseModel):
    """Public-safe representation of a user record.

    Attributes
    ----------
    id : UUID
        Primary key of the user.
    email : str
        The user's e-mail address.
    username : str
        The user's display name (lowercased).
    is_active : bool
        Whether the account is active.
    created_at : datetime
        Timestamp of account creation.
    """

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    email: str
    username: str
    is_active: bool
    created_at: datetime


class AuthResponseDTO(BaseModel):
    """Full authentication response sent to the client.

    Attributes
    ----------
    user : UserResponseDTO
        The authenticated user's public profile.
    access_token : str
        Short-lived JWT access token.
    refresh_token : str
        Longer-lived JWT refresh token.
    token_type : str
        Token scheme identifier (always ``"Bearer"``).
    expires_in : int
        Lifetime of the access token in seconds.
    """

    user: UserResponseDTO
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int

    @classmethod
    def from_user_and_tokens(
        cls,
        user: dict,
        tokens: dict,
    ) -> AuthResponseDTO:
        """Construct an :class:`AuthResponseDTO` from raw dicts.

        This is a convenience factory intended to be called with the user
        dict returned by the database layer and the tokens dict produced by
        :func:`auth.strategies.jwt_strategy.generate_token_pair`.

        Parameters
        ----------
        user : dict
            A dictionary with at least the keys ``id``, ``email``,
            ``username``, ``is_active``, and ``created_at``.
        tokens : dict
            A dictionary with at least the keys ``access_token``,
            ``refresh_token``, and ``expires_in``.

        Returns
        -------
        AuthResponseDTO
            A fully populated response DTO ready for JSON serialisation.
        """
        return cls(
            user=UserResponseDTO(**user),
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            expires_in=tokens["expires_in"],
        )
