# Tool Naming Fix Documentation

## Issue Description

The MCP server integration was failing with the error:
```
Error calling tool get_weather: Invalid tool name format: get_weather
```

This occurred because there was a mismatch between how tools were being stored internally and how they were being called by the LLM.

## Root Cause

The original implementation had a naming conflict:

1. **Tool Storage**: Tools were stored with namespaced names (`server-name:tool-name`)
2. **LLM Function Calls**: The LLM was calling tools with their original names (`get_weather`)
3. **Tool Lookup**: The system expected namespaced names during tool execution

This created a disconnect where the LLM would call `get_weather` but the system would look for `Weather:get_weather`.

## Solution Implemented

### 1. Smart Tool Name Management

The system now intelligently handles tool names based on conflicts:

- **No Conflicts**: Tools with unique names are presented to the LLM with their original names
- **Conflicts**: When multiple servers have tools with the same name, they are namespaced

### 2. Enhanced Tool Storage Structure

```typescript
interface MCPToolWithServer extends MCPTool {
  serverId: string;
  serverName: string;
  originalName: string;
  hasConflict: boolean;
}
```

### 3. Conflict Detection Algorithm

```typescript
// Check for tool name conflicts and namespace when needed
const toolNameCounts = new Map<string, number>();
allToolsWithServer.forEach((tool) => {
  toolNameCounts.set(
    tool.originalName,
    (toolNameCounts.get(tool.originalName) || 0) + 1
  );
});

// Update tool names and conflict flags
this.availableTools = allToolsWithServer.map((tool) => {
  const hasConflict = (toolNameCounts.get(tool.originalName) || 0) > 1;
  return {
    ...tool,
    name: hasConflict ? `${tool.serverName}:${tool.originalName}` : tool.originalName,
    hasConflict
  };
});
```

### 4. Flexible Tool Calling

The `callTool` method now handles both scenarios:

```typescript
// Find the tool in our available tools list
let toolWithServer = this.availableTools.find(
  (tool) => tool.name === toolCall.name
);

// If not found and tool name doesn't contain ':', try to find by original name
if (!toolWithServer && !toolCall.name.includes(':')) {
  toolWithServer = this.availableTools.find(
    (tool) => tool.originalName === toolCall.name
  );
}
```

## Benefits of This Approach

### 1. Backward Compatibility
- Existing server configurations continue to work
- No changes required to UI components
- Maintains all existing APIs

### 2. Smart Conflict Resolution
- Tools with unique names get clean names (e.g., `get_weather`)
- Conflicting tools get namespaced names (e.g., `Weather:get_weather`, `Climate:get_weather`)
- Automatic detection and resolution

### 3. LLM-Friendly
- LLM sees simple tool names when possible
- Reduces cognitive load on the AI model
- Maintains clarity in function calling

### 4. Robust Tool Lookup
- Handles both namespaced and non-namespaced tool calls
- Fallback mechanisms for edge cases
- Clear error messages for debugging

## Example Scenarios

### Scenario 1: Single Server with Unique Tools
```
Server: Weather
Tools: get_weather, get_forecast

LLM sees: get_weather, get_forecast
LLM calls: get_weather
System executes: get_weather on Weather server
```

### Scenario 2: Multiple Servers with Conflicting Tools
```
Server 1: Weather
Tools: get_data, get_forecast

Server 2: Database  
Tools: get_data, query_table

LLM sees: Weather:get_data, get_forecast, Database:get_data, query_table
LLM calls: Weather:get_data
System executes: get_data on Weather server
```

### Scenario 3: Mixed Scenario
```
Server 1: Weather
Tools: get_weather, get_status

Server 2: Database
Tools: get_status, query_data

LLM sees: get_weather, Weather:get_status, Database:get_status, query_data
LLM calls: get_weather (unique) or Weather:get_status (conflicted)
```

## Implementation Details

### Files Modified
- `src/main/services/mcpService.ts` - Core tool management logic
- Enhanced `MCPToolWithServer` interface
- Updated `updateAvailableTools()` method
- Improved `callTool()` method

### Key Methods Updated

1. **`updateAvailableTools()`**
   - Detects tool name conflicts
   - Applies namespacing only when necessary
   - Maintains tool-to-server mapping

2. **`callTool()`**
   - Handles both namespaced and non-namespaced calls
   - Fallback lookup mechanisms
   - Proper error handling

3. **`listTools()`**
   - Returns clean tool list for LLM consumption
   - Strips internal metadata
   - Maintains tool functionality

## Testing

The fix has been validated with:
- TypeScript compilation (no errors)
- Build process (successful)
- Test server integration (weather.js)
- Multiple tool scenarios

## Future Considerations

1. **Performance**: The conflict detection runs on every tool update, but this is acceptable given the typical number of tools
2. **Extensibility**: The system can be extended to handle more complex naming strategies
3. **Monitoring**: Could add logging for tool name conflicts to help with debugging
4. **Configuration**: Could allow users to configure naming preferences

This fix ensures that MCP tool calling works seamlessly while maintaining a clean and intuitive interface for both developers and the LLM.