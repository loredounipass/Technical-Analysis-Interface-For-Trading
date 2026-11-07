"""Bcrypt password hashing and verification.

Thin wrapper around the ``bcrypt`` library so the rest of the application
never has to deal with byte-encoding or salt generation directly.
"""

import bcrypt

from auth.constants import BCRYPT_ROUNDS


def hash_password(plain_password: str) -> str:
    """Hash *plain_password* with bcrypt and return the UTF-8 hash string.

    Parameters
    ----------
    plain_password:
        The user-supplied password in cleartext.

    Returns
    -------
    str
        A bcrypt hash string suitable for database storage.
    """
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return ``True`` when *plain_password* matches *hashed_password*.

    Parameters
    ----------
    plain_password:
        The user-supplied password in cleartext.
    hashed_password:
        The bcrypt hash previously stored in the database.

    Returns
    -------
    bool
        ``True`` if the password is correct, ``False`` otherwise.
    """
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


# Pre-computed bcrypt hash with 12 rounds for constant-time dummy verification.
# Used when a user email is not found, equalizing response times to prevent
# user enumeration via timing oracle attacks.
_DUMMY_BCRYPT_HASH = "$2b$12$e80yqZ68Z1tq1b.Wj3lVneP7xY32G2z/eQY9e0tY2y6wJ4r7W1l.2"


def dummy_verify_password(plain_password: str) -> bool:
    """Execute bcrypt.checkpw against a dummy hash to equalize response times."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72],
            _DUMMY_BCRYPT_HASH.encode("utf-8"),
        )
    except Exception:
        return False
