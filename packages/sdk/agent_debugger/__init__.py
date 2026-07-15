"""
Agent Debugger SDK — Instrument your AI agents for trace debugging & monitoring.

Usage:
    from agent_debugger import trace, TraceConfig

    config = TraceConfig(api_key="ad_...", base_url="https://agent-debugger.pages.dev")

    @trace(config)
    def my_agent(user_input: str):
        # Your agent logic here
        ...
        yield "thinking", {...}
        yield "tool_call", {"tool": "search", "input": {...}}
        ...
"""

from .config import TraceConfig
from .tracer import AgentTracer, trace
from .decorator import trace_agent

__all__ = ["TraceConfig", "AgentTracer", "trace", "trace_agent"]
__version__ = "0.1.0"
