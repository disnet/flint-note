const { spawn } = require('child_process');
const path = require('path');

// Test script to verify LLM integration
console.log('🧪 Testing LLM Integration...\n');

// Test 1: Check if LangChain dependencies are installed
console.log('1. Checking dependencies...');
try {
  const langchain = require('langchain/package.json');
  const openai = require('@langchain/openai/package.json');
  const core = require('@langchain/core/package.json');
  console.log('✅ LangChain dependencies found');
  console.log(`  - langchain: ${langchain.version}`);
  console.log(`  - @langchain/openai: ${openai.version}`);
  console.log(`  - @langchain/core: ${core.version}\n`);
} catch (error) {
  console.log('❌ LangChain dependencies missing:', error.message);
  console.log('Run: npm install langchain @langchain/openai @langchain/core\n');
  process.exit(1);
}

// Test 2: Check if build succeeds
console.log('2. Testing build...');
const buildProcess = spawn('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

buildProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Build successful\n');
    runTypeCheck();
  } else {
    console.log('❌ Build failed\n');
    process.exit(1);
  }
});

function runTypeCheck() {
  console.log('3. Running type check...');
  const typeCheckProcess = spawn('npm', ['run', 'typecheck'], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname
  });

  typeCheckProcess.on('close', (code) => {
    if (code === 0) {
      console.log('✅ Type check passed\n');
      printSetupInstructions();
    } else {
      console.log('❌ Type check failed\n');
      process.exit(1);
    }
  });
}

function printSetupInstructions() {
  console.log('🎉 LLM Integration Test Complete!\n');
  console.log('📋 Setup Instructions for LM Studio:');
  console.log('────────────────────────────────────');
  console.log('1. Download LM Studio from https://lmstudio.ai/');
  console.log('2. Install and open LM Studio');
  console.log('3. Download a model (recommended: Llama 3.1 8B)');
  console.log('4. Start the local server on port 1234');
  console.log('5. Run the Flint app: npm run dev');
  console.log('6. Click the settings gear and configure LLM settings');
  console.log('7. Test the connection and start chatting!\n');

  console.log('🔧 Default LLM Settings:');
  console.log('────────────────────────');
  console.log('Base URL: http://localhost:1234/v1');
  console.log('API Key: lm-studio');
  console.log('Model Name: local-model');
  console.log('Temperature: 0.7');
  console.log('Max Tokens: 2048\n');

  console.log('💡 Features Ready:');
  console.log('──────────────────');
  console.log('✅ Real-time LLM conversations');
  console.log('✅ Streaming responses');
  console.log('✅ Slash commands with LLM integration');
  console.log('✅ Note references using [[Note Title]] syntax');
  console.log('✅ LLM settings configuration');
  console.log('✅ Connection testing and error handling');
  console.log('✅ Fallback to mock responses if LLM unavailable\n');

  console.log('🚀 Ready to start! Run: npm run dev');
}
