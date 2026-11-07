"""Public-route marker decorator.

Marks a Flask view function as *public* so that authentication middleware
(e.g. :func:`auth.guards.jwt_guard.jwt_required`) can skip token
verification for that endpoint.

Usage
-----
Mark a route as public::

    from auth.guards import public

    @app.route("/health")
    @public
    def health_check():
        return {"status": "ok"}

Check whether a view function is public::

    from auth.guards import is_public_route

    if is_public_route(health_check):
        print("No auth needed")
"""

from __future__ import annotations

from typing import Any, Callable, TypeVar

_F = TypeVar("_F", bound=Callable[..., Any])

_PUBLIC_ATTR: str = "_is_public_route"


def public(fn: _F) -> _F:
    """Decorator that marks *fn* as a public (unauthenticated) route.

    The decorated function is returned **unchanged** — no wrapper is added.
    It simply gains a boolean attribute that :func:`is_public_route` can
    inspect later.

    Parameters
    ----------
    fn : callable
        The Flask view function to mark as public.

    Returns
    -------
    callable
        The same function, with ``_is_public_route`` set to ``True``.
    """
    setattr(fn, _PUBLIC_ATTR, True)
    return fn


def is_public_route(fn: Any) -> bool:
    """Return ``True`` if *fn* has been decorated with :func:`public`.

    Recursively inspects ``__wrapped__`` in case *fn* was wrapped by
    ``functools.wraps`` or other decorators.

    Parameters
    ----------
    fn : object
        Any callable (typically a Flask view function).

    Returns
    -------
    bool
        ``True`` when the function carries the public-route marker;
        ``False`` otherwise.
    """
    target = fn
    while target is not None:
        if getattr(target, _PUBLIC_ATTR, False):
            return True
        target = getattr(target, "__wrapped__", None)
    return False
