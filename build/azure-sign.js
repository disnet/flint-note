/**
 * Azure Trusted Signing script for electron-builder
 *
 * This script signs Windows executables using Microsoft Trusted Signing service.
 * It's called by electron-builder during the Windows build process.
 *
 * Uses the Invoke-TrustedSigning PowerShell cmdlet (same as azure/trusted-signing-action).
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
 * Sign a file using Azure Trusted Signing
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

  // Validate file path
  if (!filePath || typeof filePath !== 'string') {
    throw new Error(`Invalid file path: ${filePath}`);
  }

  try {
    await signWithTrustedSigning(filePath);
    console.log(`✅ Successfully signed ${filePath}\n`);
  } catch (error) {
    console.error('❌ Signing failed:', error.message);
    throw error;
  }
}

/**
 * Sign using Invoke-TrustedSigning PowerShell cmdlet
 * This is the same method used by azure/trusted-signing-action
 */
async function signWithTrustedSigning(filePath) {
  return new Promise((resolve, reject) => {
    // PowerShell script to install module and sign file
    const psScript = `
$ErrorActionPreference = 'Stop'

# Install TrustedSigning module if not present
if (-not (Get-Module -ListAvailable -Name TrustedSigning)) {
    Write-Host "Installing TrustedSigning module..."
    Install-Module -Name TrustedSigning -Force -Scope CurrentUser -Repository PSGallery
}

Import-Module TrustedSigning

# Sign the file
Write-Host "Signing file: ${filePath.replace(/\\/g, '\\\\')}"

Invoke-TrustedSigning \`
    -Endpoint "$env:AZURE_SIGNING_ENDPOINT" \`
    -TrustedSigningAccountName "$env:AZURE_SIGNING_ACCOUNT_NAME" \`
    -CertificateProfileName "$env:AZURE_CERTIFICATE_PROFILE" \`
    -Files "${filePath.replace(/\\/g, '\\\\')}" \`
    -FileDigest SHA256 \`
    -TimestampRfc3161 "http://timestamp.acs.microsoft.com" \`
    -TimestampDigest SHA256 \`
    -Verbose

Write-Host "Signing completed successfully"
`;

    console.log('Running: Invoke-TrustedSigning via PowerShell...');
    console.log('   File:', filePath.split(/[\\/]/).pop());

    const powershell = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      }
    );

    let stdout = '';
    let stderr = '';

    powershell.stdout.on('data', (data) => {
      stdout += data.toString();
      const lines = data.toString().split('\n').filter(Boolean);
      lines.forEach((line) => console.log(`   ${line}`));
    });

    powershell.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`   ${data.toString()}`);
    });

    powershell.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `PowerShell signing failed with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`
          )
        );
      }
    });

    powershell.on('error', (error) => {
      reject(new Error(`Failed to execute PowerShell: ${error.message}`));
    });
  });
}
