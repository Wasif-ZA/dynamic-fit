"""Backend maintenance runs without requiring an open browser session."""

import asyncio
import logging

from app import store

logger = logging.getLogger(__name__)
ARCHIVE_SWEEP_SECONDS = 60


async def archive_sweep() -> None:
    try:
        await asyncio.to_thread(store.archive_due_orders)
    except Exception:
        logger.exception("Automatic order archiving failed; the next sweep will retry")


async def archive_loop() -> None:
    while True:
        await asyncio.sleep(ARCHIVE_SWEEP_SECONDS)
        await archive_sweep()
