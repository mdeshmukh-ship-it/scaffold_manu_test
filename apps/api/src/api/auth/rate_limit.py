from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}
        self._lock = Lock()

    def allow(self, *, key: str, max_requests: int, window_seconds: int, block_seconds: int = 0) -> RateLimitDecision:
        now = time.time()
        with self._lock:
            blocked_until = self._blocked_until.get(key)
            if blocked_until and blocked_until > now:
                return RateLimitDecision(allowed=False, retry_after_seconds=max(1, int(blocked_until - now)))

            window_start = now - window_seconds
            events = self._events[key]
            while events and events[0] < window_start:
                events.popleft()

            if len(events) >= max_requests:
                if block_seconds > 0:
                    self._blocked_until[key] = now + block_seconds
                    return RateLimitDecision(allowed=False, retry_after_seconds=block_seconds)
                oldest = events[0]
                retry_after = max(1, int((oldest + window_seconds) - now))
                return RateLimitDecision(allowed=False, retry_after_seconds=retry_after)

            events.append(now)
            return RateLimitDecision(allowed=True, retry_after_seconds=0)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()
            self._blocked_until.clear()


rate_limiter = InMemoryRateLimiter()
