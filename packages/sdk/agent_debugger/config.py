from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TraceConfig:
    """Configuration for the Agent Debugger tracer."""

    api_key: str
    base_url: str = "https://agent-debugger.pages.dev"
    project_id: Optional[str] = None
    agent_name: str = "agent"
    framework: str = "custom"
    model: Optional[str] = None
    auto_flush: bool = True
    flush_interval: float = 5.0  # seconds
    tags: list[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
