# Test MCP Servers

This directory contains example MCP (Model Context Protocol) servers for testing and development purposes.

## Weather Server

The `weather.js` file is a complete MCP server implementation that provides weather-related tools.

### Features

- **get_weather**: Get current weather conditions for a city
- **get_forecast**: Get weather forecast for a city (1-7 days)

### Supported Cities

The weather server includes mock data for:
- New York
- London  
- Tokyo
- Paris

### Usage

#### Running the server standalone

```bash
cd examples/test-servers
node weather.js
```

#### Testing with MCP protocol

```bash
# Test tool listing
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | node weather.js

# Test weather tool
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "get_weather", "arguments": {"location": "New York"}}}' | node weather.js
```

#### Using in Flint

1. Open Flint settings
2. Go to "MCP Server Management" 
3. Add a new server with:
   - **Name**: Weather Test Server
   - **Command**: node
   - **Arguments**: examples/test-servers/weather.js
   - **Description**: Test weather server with mock data

### Implementation Details

The weather server demonstrates:

- Proper MCP server setup using the official SDK
- Tool registration with Zod schema validation
- Stdio transport communication
- Error handling for unknown cities
- Mock data generation for testing

### Example Queries

Once connected to Flint, you can ask:

- "What's the weather in New York?"
- "Give me a 5-day forecast for London"
- "How's the weather in Tokyo?"

### Extending the Server

To add more cities or tools:

1. Update the `weatherData` object with new city information
2. Add new tools using `server.tool()` method
3. Restart the server to pick up changes

### Requirements

- Node.js 18+
- @modelcontextprotocol/sdk
- zod

All dependencies are already available through the parent project's node_modules.