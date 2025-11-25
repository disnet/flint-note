/**
 * Azure Trusted Signing script for electron-builder
 *
 * This script signs Windows executables using Microsoft Trusted Signing service.
 * It's called by electron-builder during the Windows build process.
 *
 * Environment variables required:
 * - AZURE_TENANT_ID: Azure tenant ID
 * - AZURE_CLIENT_ID: Azure application (client) ID
 * - AZURE_CLIENT_SECRET: Azure client secret
 * - AZURE_SIGNING_ENDPOINT: Trusted Signing endpoint URL
 * - AZURE_SIGNING_ACCOUNT_NAME: Trusted Signing account name
 * - AZURE_CERTIFICATE_PROFILE: Certificate profile name
 */

import { spawn } from 'child_process';

/**
 * Sign a file using Azure Trusted Signing via AzureSignTool
 * @param {Object} configuration - Signing configuration from electron-builder
 */
export default async function sign(configuration) {
  const { path: filePath } = configuration;

  console.log(`\n🔐 Signing ${filePath} with Azure Trusted Signing...`);

  // Validate required environment variables
  const requiredEnvVars = [
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_SIGNING_ENDPOINT',
    'AZURE_SIGNING_ACCOUNT_NAME',
    'AZURE_CERTIFICATE_PROFILE'
  ];

  const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn(
      '⚠️  Azure Trusted Signing credentials not configured - skipping code signing'
    );
    console.warn('   Missing environment variables:');
    missingVars.forEach((varName) => console.warn(`   - ${varName}`));
    console.warn('\n   The installer will be built but NOT signed.');
    console.warn('   Windows will show "Unknown Publisher" warnings.\n');
    return; // Skip signing, don't throw error
  }

  try {
    await signWithAzureSignTool(filePath);
    console.log(`✅ Successfully signed ${filePath}\n`);
  } catch (error) {
    console.error('❌ Signing failed:', error.message);
    throw error;
  }
}

/**
 * Sign using AzureSignTool
 * AzureSignTool is a standalone tool for Azure Trusted Signing that handles
 * authentication and signing in one step.
 */
async function signWithAzureSignTool(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      'sign',
      // Azure authentication
      '--azure-key-vault-tenant-id',
      process.env.AZURE_TENANT_ID,
      '--azure-key-vault-client-id',
      process.env.AZURE_CLIENT_ID,
      '--azure-key-vault-client-secret',
      process.env.AZURE_CLIENT_SECRET,
      // Trusted Signing configuration
      '--trusted-signing-endpoint',
      process.env.AZURE_SIGNING_ENDPOINT,
      '--trusted-signing-account',
      process.env.AZURE_SIGNING_ACCOUNT_NAME,
      '--trusted-signing-cert-profile',
      process.env.AZURE_CERTIFICATE_PROFILE,
      // Signing options
      '--file-digest',
      'sha256',
      '--timestamp-rfc3161',
      'http://timestamp.acs.microsoft.com',
      '--timestamp-digest',
      'sha256',
      // Description
      '--description',
      'Flint - A note-taking app',
      '--description-url',
      'https://www.flintnote.com',
      // Verbose output
      '--verbose',
      // File to sign
      filePath
    ];

    console.log('Running: AzureSignTool', args.slice(0, 3).join(' '), '...');

    const signTool = spawn('AzureSignTool', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    signTool.stdout.on('data', (data) => {
      stdout += data.toString();
      // Print progress
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach((line) => console.log(`   ${line}`));
    });

    signTool.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`   ${data.toString()}`);
    });

    signTool.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `AzureSignTool failed with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`
          )
        );
      }
    });

    signTool.on('error', (error) => {
      if (error.code === 'ENOENT') {
        reject(
          new Error(
            'AzureSignTool not found. Install it with: dotnet tool install --global AzureSignTool'
          )
        );
      } else {
        reject(new Error(`Failed to execute AzureSignTool: ${error.message}`));
      }
    });
  });
}
