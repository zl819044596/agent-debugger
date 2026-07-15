"""Decorators for popular agent frameworks."""

from functools import wraps
from typing import Callable, Any

from .config import TraceConfig
from .tracer import AgentTracer


def trace_agent(config: TraceConfig):
    """Trace any agent function. Works with any framework.

    Usage:
        @trace_agent(TraceConfig(api_key="...", agent_name="researcher"))
        def my_agent(user_input: str):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            with AgentTracer(config) as tracer:
                # Pass tracer to the wrapped function
                result = func(*args, **kwargs, tracer=tracer)
            return result
        return wrapper
    return decorator


def trace_autogen(config: TraceConfig):
    """AutoGen-specific tracer."""
    from autogen import Agent, ConversableAgent

    class TracedAgent(ConversableAgent):
        def __init__(self, name, *args, **kwargs):
            super().__init__(name, *args, **kwargs)
            self._ad_tracer = AgentTracer(config)

        def generate_reply(self, messages=None, sender=None, **kwargs):
            step = {
                "step_type": "think",
                "input": str(messages[-1]) if messages else "",
                "agent": self.name,
            }
            self._ad_tracer.record_step(**step)
            result = super().generate_reply(messages, sender, **kwargs)
            self._ad_tracer.record_step(
                step_type="message",
                output=str(result)[:1000],
                agent=self.name,
            )
            self._ad_tracer.flush()
            return result

        def __del__(self):
            self._ad_tracer.end()

    return TracedAgent


def trace_crewai(config: TraceConfig):
    """CrewAI-specific tracer (simple wrapper)."""
    try:
        from crewai import Agent as CrewAgent

        original_execute = CrewAgent.execute_task

        @wraps(original_execute)
        def traced_execute(self, task, context=None, tools=None, *args, **kwargs):
            tracer = AgentTracer(config)
            tracer.record_step(
                step_type="think",
                input=f"Task: {task.description[:500] if hasattr(task, 'description') else str(task)[:500]}",
                agent_name=self.role if hasattr(self, 'role') else self.__class__.__name__,
            )
            try:
                result = original_execute(self, task, context, tools, *args, **kwargs)
                tracer.record_step(step_type="message", output=str(result)[:1000])
                tracer.end("completed")
                return result
            except Exception as e:
                tracer.record_step(step_type="error", error=str(e))
                tracer.end("error")
                raise

        CrewAgent.execute_task = traced_execute
        return CrewAgent
    except ImportError:
        raise ImportError("crewai is not installed")
