"""Quick demo: send traces to Agent Debugger Dashboard."""
import sys
sys.path.insert(0, '/Volumes/Data/GitHub/agent-debugger/packages/sdk')

from agent_debugger import TraceConfig, AgentTracer

API_KEY = "ad_623983db827e5704a444a26fe74ece18"
BASE_URL = "https://debug.getfitai.io"

print("🧪 发送 Trace 到 Agent Debugger...")

config = TraceConfig(
    api_key=API_KEY,
    base_url=BASE_URL,
    agent_name="weather-agent",
    framework="custom",
    model="gpt-4o",
)

with AgentTracer(config) as tracer:
    tracer.record_step(
        step_type="think",
        input="User asked: What is the weather in Tokyo?",
        output="Let me search for Tokyo weather data",
        thinking="The user wants current weather. I should call the weather API for Tokyo.",
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
        tool_output={"temperature": 22, "conditions": "partly cloudy", "humidity": 65},
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

print(f"✅ 发送成功！Trace ID: {tracer.trace_id}")
print()
print("👉 现在刷新 Dashboard (https://debug.getfitai.io/app/dashboard)")
print("   查看 Project: default，就能看到这条 Trace")
