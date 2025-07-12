const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const {
  ListToolsResultSchema,
  CallToolResultSchema
} = require('@modelcontextprotocol/sdk/types.js');

async function testMCPServer() {
  console.log('🧪 Testing MCP server connection...');

  try {
    // Create transport
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['@flint-note/server'],
      env: process.env
    });

    // Create client
    const client = new Client(
      {
        name: 'flint-debug',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Connect
    console.log('🔗 Connecting to server...');
    await client.connect(transport);
    console.log('✅ Connected successfully');

    // List tools
    console.log('📋 Listing available tools...');
    const toolsResult = await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema
    );

    console.log('🔧 Available tools:');
    toolsResult.tools.forEach((tool) => {
      console.log(`  - ${tool.name}: ${tool.description}`);
      console.log(`    Schema:`, JSON.stringify(tool.inputSchema, null, 2));
    });

    // Test get_note tool if available
    const getNoteTool = toolsResult.tools.find((t) => t.name === 'get_note');
    if (getNoteTool) {
      console.log('\n🔍 Testing get_note tool...');

      // First try with title parameter
      try {
        console.log('Testing with title parameter...');
        const result1 = await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'get_note',
              arguments: {
                title: 'The Unaccountability Machine'
              }
            }
          },
          CallToolResultSchema
        );
        console.log('✅ get_note with title worked:', result1);
      } catch (error) {
        console.log('❌ get_note with title failed:', error.message);
      }

      // Try with different parameter names
      const paramNames = ['name', 'note_title', 'filename', 'path'];
      for (const paramName of paramNames) {
        try {
          console.log(`Testing with ${paramName} parameter...`);
          const result = await client.request(
            {
              method: 'tools/call',
              params: {
                name: 'get_note',
                arguments: {
                  [paramName]: 'The Unaccountability Machine'
                }
              }
            },
            CallToolResultSchema
          );
          console.log(`✅ get_note with ${paramName} worked:`, result);
          break;
        } catch (error) {
          console.log(`❌ get_note with ${paramName} failed:`, error.message);
        }
      }
    }

    // Test search_notes tool if available
    const searchNotesTool = toolsResult.tools.find((t) => t.name === 'search_notes');
    if (searchNotesTool) {
      console.log('\n🔍 Testing search_notes tool...');
      try {
        const result = await client.request(
          {
            method: 'tools/call',
            params: {
              name: 'search_notes',
              arguments: {
                query: 'The Unaccountability Machine',
                limit: 5
              }
            }
          },
          CallToolResultSchema
        );
        console.log('✅ search_notes worked:', result);
      } catch (error) {
        console.log('❌ search_notes failed:', error.message);
      }
    }

    // Close connection
    await transport.close();
    console.log('🔌 Connection closed');
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

testMCPServer().catch(console.error);
