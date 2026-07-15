"""Core tracer implementation."""
import json
import time
import uuid
import logging
from typing import Optional, Generator, AsyncGenerator

import httpx

from .config import TraceConfig

logger = logging.getLogger("agent_debugger")


class AgentTracer:
    """Tracer that records agent execution steps and sends them to the API."""

    def __init__(self, config: TraceConfig):
        self.config = config
        self.trace_id = str(uuid.uuid4())
        self.steps: list[dict] = []
        self._started_at = time.time()
        self._client = httpx.Client(
            base_url=config.base_url,
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        self._send_trace_start()

    def _send_trace_start(self):
        """Notify API that a trace has started."""
        try:
            payload = {
                "type": "trace_start",
                "trace_id": self.trace_id,
                "agent_name": self.config.agent_name,
                "framework": self.config.framework,
                "model": self.config.model,
                "tags": self.config.tags,
                "metadata": self.config.metadata,
            }
            r = self._client.post("/api/ingest", json=payload)
            r.raise_for_status()
            logger.debug(f"Trace started: {self.trace_id}")
        except Exception as e:
            logger.warning(f"Failed to send trace start: {e}")

    def record_step(
        self,
        step_type: str,
        *,
        input: Optional[str] = None,
        output: Optional[str] = None,
        thinking: Optional[str] = None,
        tool_name: Optional[str] = None,
        tool_input: Optional[dict] = None,
        tool_output: Optional[dict] = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cost: float = 0.0,
        latency_ms: int = 0,
        status: str = "success",
        error: Optional[str] = None,
        handoff_to_agent: Optional[str] = None,
        handoff_trace_id: Optional[str] = None,
    ) -> dict:
        """Record a single step in the trace."""
        step = {
            "step_type": step_type,
            "input": input,
            "output": output,
            "thinking": thinking,
            "tool_name": tool_name,
            "tool_input": tool_input,
            "tool_output": tool_output,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": cost,
            "latency_ms": latency_ms,
            "status": status,
            "error": error,
            "handoff_to_agent": handoff_to_agent,
            "handoff_trace_id": handoff_trace_id,
        }
        self.steps.append(step)
        return step

    def flush(self):
        """Send buffered steps to the API."""
        if not self.steps:
            return

        try:
            payload = {
                "trace_id": self.trace_id,
                "steps": list(self.steps),
            }
            r = self._client.post("/api/ingest", json=payload)
            r.raise_for_status()
            self.steps.clear()
            logger.debug(f"Flushed {len(payload['steps'])} steps")
        except Exception as e:
            logger.warning(f"Failed to flush steps: {e}")

    def end(self, status: str = "completed"):
        """End the trace and flush remaining steps."""
        self.flush()
        try:
            elapsed_ms = int((time.time() - self._started_at) * 1000)
            payload = {
                "type": "trace_end",
                "trace_id": self.trace_id,
                "status": status,
                "total_latency_ms": elapsed_ms,
            }
            r = self._client.post("/api/ingest", json=payload)
            r.raise_for_status()
            logger.info(f"Trace ended: {self.trace_id} ({status})")
        except Exception as e:
            logger.warning(f"Failed to end trace: {e}")
        finally:
            self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        status = "error" if exc_type else "completed"
        self.end(status=status)
        return False


def trace(config: TraceConfig):
    """Decorator that wraps a function with an AgentTracer.

    Usage:
        @trace(TraceConfig(api_key="ad_..."))
        def my_agent(input: str):
            ...
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            tracer = AgentTracer(config)
            try:
                result = func(*args, **kwargs, _tracer=tracer)
                tracer.end("completed")
                return result
            except Exception as e:
                tracer.end("error")
                raise
        return wrapper
    return decorator
