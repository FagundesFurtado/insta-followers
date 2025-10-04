from __future__ import annotations

import random
import time
from typing import Iterable

from instaloader.instaloadercontext import InstaloaderContext, RateController


class GentleRateController(RateController):
    def __init__(
        self,
        ctx: InstaloaderContext,
        *,
        base_delay: float = 8.0,
        jitter: float = 4.0,
        cooldown_codes: Iterable[int] = (401, 403, 429),
        cooldown_factor: float = 5.0,
    ) -> None:
        super().__init__(ctx)
        self.base_delay = base_delay
        self.jitter = jitter
        self.cooldown_codes = set(cooldown_codes)
        self.cooldown_factor = cooldown_factor

    def _sleep(self, seconds: float, reason: str) -> None:
        extra = random.uniform(0, self.jitter)
        total = seconds + extra
        self._ctx.log(f"{reason}; sleeping for {total:.2f} seconds")
        time.sleep(total)

    def wait_before_query(self, query_type: str) -> None:  # noqa: D401
        self._sleep(self.base_delay, f"Throttling before {query_type}")

    def sleep(self, seconds: float) -> None:  # noqa: D401
        self._sleep(seconds, "Backing off per Instaloader request")

    def handle_status_code(self, status_code: int, query_type: str) -> None:
        if status_code in self.cooldown_codes:
            self._sleep(self.base_delay * self.cooldown_factor, f"HTTP {status_code} on {query_type}")
        else:
            super().handle_status_code(status_code, query_type)

    def handle_429(self, response, query_type: str) -> None:  # noqa: ANN001
        self._sleep(self.base_delay * self.cooldown_factor * 1.5, f"HTTP 429 on {query_type}")


__all__ = ["GentleRateController"]
