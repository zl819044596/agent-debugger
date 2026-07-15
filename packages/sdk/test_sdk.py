"""Test the Agent Debugger SDK end-to-end."""
import sys
sys.path.insert(0, '/Volumes/Data/GitHub/agent-debugger/packages/sdk')

from agent_debugger import TraceConfig, AgentTracer

# Test 1: Basic trace with steps
print("=== Test 1: Basic trace ===")
config = TraceConfig(
    api_key="ad_test_key_001",
    base_url="https://agent-debugger.pages.dev",
    agent_name="test-agent",
    framework="custom",
    model="gpt-4",
)

with AgentTracer(config) as tracer:
    tracer.record_step(
        step_type="think",
        input="User asked: What is the weather in Tokyo?",
        output="Let me search for Tokyo weather",
        thinking="The user wants weather data. I should use the weather tool.",
        input_tokens=80,
        output_tokens=40,
        cost=0.001,
        latency_ms=600,
    )
    
    tracer.record_step(
        step_type="tool_call",
        tool_name="get_weather",
        tool_input={"city": "Tokyo", "units": "celsius"},
        input_tokens=60,
        output_tokens=200,
        cost=0.002,
        latency_ms=1500,
    )
    
    tracer.record_step(
        step_type="tool_result",
        tool_output={"temperature": 22, "conditions": "partly cloudy"},
        input_tokens=0,
        output_tokens=100,
        cost=0.0005,
        latency_ms=0,
    )
    
    tracer.record_step(
        step_type="think",
        input="Tool returned Tokyo: 22°C, partly cloudy",
        output="The weather in Tokyo is 22°C with partly cloudy conditions.",
        thinking="Processing completed. Ready to respond to user.",
        input_tokens=30,
        output_tokens=25,
        cost=0.0005,
        latency_ms=200,
    )

print("Trace sent successfully!")
print(f"Trace ID: {tracer.trace_id}")

# Verify via API
import httpx
r = httpx.get(f"https://agent-debugger.pages.dev/api/traces?project_id=test-project-001")
data = r.json()
print(f"\nTraces in DB: {len(data.get('traces', []))}")
if data.get('traces'):
    t = data['traces'][0]
    print(f"Latest: {t['agent_name']} | {t['framework']} | {t['model']}")
