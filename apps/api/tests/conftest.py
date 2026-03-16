from __future__ import annotations

import asyncio
import os
from collections.abc import Coroutine, Iterator
from typing import Any

import pytest

from api.auth.rate_limit import rate_limiter
from api.db import dispose_db
from api.settings import clear_settings_cache


def _run_async(coro: Coroutine[Any, Any, object]) -> None:
    try:
        asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(coro)
        loop.close()


@pytest.fixture(autouse=True)
def reset_runtime_state() -> Iterator[None]:
    original_env = os.environ.copy()
    yield
    os.environ.clear()
    os.environ.update(original_env)
    clear_settings_cache()
    rate_limiter.clear()
    _run_async(dispose_db())
