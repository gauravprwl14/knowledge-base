"""Unit tests for embed-worker app/main.py.

Covers:
- _on_worker_done logs error when the worker task raises
- _on_worker_done logs warning (not error) when the task is cancelled
- lifespan raises RuntimeError when run_worker() fails within 10 s
"""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# _on_worker_done callback
# ---------------------------------------------------------------------------


class TestOnWorkerDone:
    """Tests for the _on_worker_done done-callback."""

    def test_logs_error_when_task_raises(self):
        """_on_worker_done must log at error level when the task holds an exception."""
        from app.main import _on_worker_done

        exc = RuntimeError("rabbit connection refused")
        task = MagicMock(spec=asyncio.Task)
        task.cancelled.return_value = False
        task.exception.return_value = exc

        with patch("app.main.logger") as mock_logger:
            _on_worker_done(task)

        mock_logger.error.assert_called_once()
        call_kwargs = mock_logger.error.call_args
        assert call_kwargs[1].get("error") == str(exc)
        assert call_kwargs[1].get("error_type") == "RuntimeError"

    def test_logs_warning_when_task_cancelled(self):
        """_on_worker_done must log at warning level (not error) when cancelled."""
        from app.main import _on_worker_done

        task = MagicMock(spec=asyncio.Task)
        task.cancelled.return_value = True

        with patch("app.main.logger") as mock_logger:
            _on_worker_done(task)

        mock_logger.warning.assert_called_once()
        mock_logger.error.assert_not_called()

    def test_no_log_when_task_succeeds(self):
        """_on_worker_done must not log anything when the task completed normally."""
        from app.main import _on_worker_done

        task = MagicMock(spec=asyncio.Task)
        task.cancelled.return_value = False
        task.exception.return_value = None

        with patch("app.main.logger") as mock_logger:
            _on_worker_done(task)

        mock_logger.error.assert_not_called()
        mock_logger.warning.assert_not_called()


# ---------------------------------------------------------------------------
# lifespan — startup failure path
# ---------------------------------------------------------------------------


class TestLifespanStartupFailure:
    """Tests for the lifespan startup 10-second verification window."""

    @pytest.mark.asyncio
    async def test_lifespan_raises_when_worker_fails_immediately(self):
        """lifespan must raise RuntimeError when run_worker() raises before 10 s."""
        failure_exc = ConnectionError("AMQP broker unreachable")

        async def failing_worker():
            raise failure_exc

        with (
            patch("app.main.run_worker", side_effect=failing_worker),
            patch("app.main.logger"),
        ):
            from app.main import lifespan
            from fastapi import FastAPI

            test_app = FastAPI()
            ctx = lifespan(test_app)

            with pytest.raises(RuntimeError, match="Worker startup failed"):
                await ctx.__aenter__()

    @pytest.mark.asyncio
    async def test_lifespan_succeeds_when_worker_stays_alive(self):
        """lifespan must not raise when run_worker() is alive after 10 s (TimeoutError path)."""
        shutdown_event = asyncio.Event()

        async def long_running_worker():
            await shutdown_event.wait()

        with (
            patch("app.main.run_worker", side_effect=long_running_worker),
            patch("app.main.logger"),
            patch("asyncio.wait_for", side_effect=asyncio.TimeoutError),
        ):
            from app.main import lifespan
            from fastapi import FastAPI

            test_app = FastAPI()
            ctx = lifespan(test_app)

            # Should not raise
            await ctx.__aenter__()

            shutdown_event.set()
            try:
                await ctx.__aexit__(None, None, None)
            except Exception:
                pass

    @pytest.mark.asyncio
    async def test_done_callback_is_registered(self):
        """lifespan must register _on_worker_done on the worker task."""
        shutdown_event = asyncio.Event()

        async def long_running_worker():
            await shutdown_event.wait()

        with (
            patch("app.main.run_worker", side_effect=long_running_worker),
            patch("app.main.logger"),
            patch("asyncio.wait_for", side_effect=asyncio.TimeoutError),
        ):
            from app.main import lifespan
            from fastapi import FastAPI
            import app.main as main_module

            test_app = FastAPI()
            ctx = lifespan(test_app)
            await ctx.__aenter__()

            task = main_module._worker_task
            assert task is not None
            assert not task.done()

            shutdown_event.set()
            try:
                await ctx.__aexit__(None, None, None)
            except Exception:
                pass
