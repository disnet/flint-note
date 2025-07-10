# MCP Server Management

This document explains how to configure and manage MCP (Model Context Protocol) servers in the Flint GUI.

## Overview

Flint GUI supports adding arbitrary stdio MCP servers that can extend the capabilities of the AI assistant with custom tools and functionality. The MCP server management system allows you to:

- Add custom MCP servers with their own tools
- Enable/disable servers independently
- Test server connections
- Monitor server status

## Accessing MCP Settings

1. Click the settings icon in the header
2. Navigate to the "MCP Server Management" section
3. Here you can view, add, edit, and remove MCP servers

## Adding a New MCP Server

To add a new MCP server:

1. Click "Add Server" in the MCP Server Management section
2. Fill in the server details:
   - **Server Name**: A friendly name for your server (e.g., "Weather Service")
   - **Command**: The command to execute (e.g., `python -m weather_mcp_server`)
   - **Arguments**: Comma-separated command arguments (e.g., `--port, 8080, --verbose`)
   - **Description**: Optional description of what the server does
   - **Enable on startup**: Whether to connect to this server automatically

3. Click "Add Server" to save the configuration

## Server Configuration Examples

### Python MCP Server

```
Name: My Python Server
Command: python
Arguments: -m, my_mcp_server, --config, /path/to/config.json
Description: Custom Python MCP server for data processing
```

### Node.js MCP Server

```
Name: File System Tools
Command: node
Arguments: /path/to/mcp-server.js, --workspace, /home/user/projects
Description: File system operations and code analysis tools
```

### Rust MCP Server

```
Name: System Tools
Command: /path/to/system-mcp-server
Arguments: --log-level, info
Description: System monitoring and management tools
```

## Managing Servers

### Enabling/Disabling Servers

- Use the checkbox next to each server to enable or disable it
- Disabled servers won't be connected to and their tools won't be available

### Testing Server Connection

- Click "Test" next to any server to verify it can be started
- The test will show if the connection is successful and how many tools are available

### Removing Servers

- Click "Remove" next to any server to delete it from the configuration
- This action cannot be undone

## Server Requirements

For a server to work with Flint, it must:

1. **Support stdio communication**: The server must communicate via stdin/stdout
2. **Implement MCP protocol**: Follow the Model Context Protocol specification
3. **Be executable**: The command must be accessible from the system PATH or use absolute paths
4. **Handle lifecycle**: Properly start, respond to requests, and shutdown when needed

## Environment Variables

You can set environment variables for your MCP servers by configuring them in the server settings. Common use cases include:

- API keys and authentication tokens
- Configuration file paths
- Runtime settings

## Troubleshooting

### Server Won't Start

- Verify the command path is correct
- Check that all required dependencies are installed
- Ensure the server executable has proper permissions
- Review the server's own documentation for setup requirements

### No Tools Available

- Check that the server implements the `tools/list` method
- Verify the server is running and responding to requests
- Look for error messages in the console

### Connection Timeouts

- Increase timeout values if your server takes time to start
- Check system resources (CPU, memory)
- Verify network connectivity if the server requires internet access

## Security Considerations

When adding MCP servers:

1. **Trust**: Only add servers from trusted sources
2. **Permissions**: Be aware that servers run with your user permissions
3. **Network**: Servers may make network requests with your credentials
4. **Data**: Servers may have access to data you provide in chat conversations

## Tool Naming

Tools from different servers are namespaced to avoid conflicts:

- Format: `server-name:tool-name`
- Example: `weather:get_current` or `filesystem:read_file`

This ensures tools from different servers don't interfere with each other.

## Best Practices

1. **Descriptive Names**: Use clear, descriptive names for your servers
2. **Documentation**: Document what each server does in the description field
3. **Resource Management**: Don't run too many servers simultaneously
4. **Testing**: Always test servers before enabling them
5. **Updates**: Keep your MCP servers updated to their latest versions

## Future Enhancements

Planned improvements include:

- Server health monitoring
- Automatic server restart on failure
- Server configuration templates
- Import/export server configurations
- Server performance metrics
- Enhanced error reporting and logging

## Getting Help

If you encounter issues:

1. Check the server's own documentation
2. Review the console for error messages
3. Test the server command manually in a terminal
4. Verify all dependencies are installed
5. Check that the server follows MCP protocol specifications

For Flint-specific issues, please refer to the main documentation or submit an issue to the project repository.
