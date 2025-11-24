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
 * - AZURE_CERTIFICATE_PROFILE: Certificate profile name
 */

import { ClientSecretCredential } from '@azure/identity';
import { readFile, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local if it exists
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
} catch (error) {
  // dotenv not available or .env.local doesn't exist
  console.log('Note: .env.local not found, using system environment variables');
}

/**
 * Sign a file using Azure Trusted Signing
 * @param {Object} configuration - Signing configuration from electron-builder
 */
export default async function sign(configuration) {
  const { path: filePath, hash, ...options } = configuration;

  console.log(`Signing ${filePath} with Azure Trusted Signing...`);

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
    console.warn('   Windows will show "Unknown Publisher" warnings.');
    console.warn('   See docs/WINDOWS-SIGNING-SETUP.md for setup instructions.\n');
    return; // Skip signing, don't throw error
  }

  try {
    // Authenticate with Azure
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID,
      process.env.AZURE_CLIENT_ID,
      process.env.AZURE_CLIENT_SECRET
    );

    // Get access token
    const tokenResponse = await credential.getToken(
      'https://codesigning.azure.net/.default'
    );

    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to obtain Azure access token');
    }

    console.log('Successfully authenticated with Azure');

    // Use SignTool if available on Windows, otherwise use REST API
    if (process.platform === 'win32') {
      await signWithSignTool(filePath, tokenResponse.token);
    } else {
      // For non-Windows platforms (e.g., building Windows installer on Mac/Linux)
      // we need to use the REST API
      await signWithRestApi(filePath, tokenResponse.token);
    }

    console.log(`Successfully signed ${filePath}`);
  } catch (error) {
    console.error('Signing failed:', error.message);
    throw error;
  }
}

/**
 * Sign using Windows SignTool with Azure credentials
 */
async function signWithSignTool(filePath, accessToken) {
  return new Promise(async (resolve, reject) => {
    // SignTool command for Azure Trusted Signing
    const metadata = {
      Endpoint: process.env.AZURE_SIGNING_ENDPOINT,
      CodeSigningAccountName: process.env.AZURE_SIGNING_ACCOUNT_NAME,
      CertificateProfileName: process.env.AZURE_CERTIFICATE_PROFILE
    };

    console.log('SignTool metadata:', JSON.stringify(metadata, null, 2));

    // Write metadata to a temporary file (SignTool expects a file path for /dmdf)
    const metadataFile = path.join(os.tmpdir(), 'azure-signing-metadata.json');
    try {
      await writeFile(metadataFile, JSON.stringify(metadata));
      console.log('Wrote metadata to:', metadataFile);
    } catch (error) {
      reject(new Error(`Failed to write metadata file: ${error.message}`));
      return;
    }

    const args = [
      'sign',
      '/v', // Verbose output
      '/debug', // Debug output
      '/fd',
      'SHA256',
      '/tr',
      'http://timestamp.digicert.com',
      '/td',
      'SHA256',
      '/dlib',
      'azure.codesigning.dlib',
      '/dmdf',
      metadataFile, // Pass file path instead of inline JSON
      '/du',
      'https://flintnote.com',
      '/d',
      'Flint',
      filePath
    ];

    console.log('SignTool command:', 'signtool', args.join(' '));

    // Set access token as environment variable for SignTool
    const env = {
      ...process.env,
      AZURE_ACCESS_TOKEN: accessToken
    };

    const signtool = spawn('signtool', args, { env });

    let stdout = '';
    let stderr = '';

    signtool.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(data.toString());
    });

    signtool.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(data.toString());
    });

    signtool.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`SignTool failed with code ${code}\n${stderr}`));
      }
    });

    signtool.on('error', (error) => {
      reject(new Error(`Failed to execute SignTool: ${error.message}`));
    });
  });
}

/**
 * Sign using Azure Trusted Signing REST API
 * This is used when building on non-Windows platforms
 */
async function signWithRestApi(filePath, accessToken) {
  // Note: This is a placeholder for REST API implementation
  // Microsoft Trusted Signing REST API requires:
  // 1. Upload the file to Azure Blob Storage
  // 2. Submit a signing request
  // 3. Poll for completion
  // 4. Download the signed file

  throw new Error(
    'REST API signing is not yet implemented. ' +
      'Please build Windows installers on a Windows machine with SignTool available, ' +
      'or implement REST API signing. See docs/WINDOWS-SIGNING-SETUP.md for details.'
  );
}

/**
 * Extract account name from endpoint URL
 */
function extractAccountName(endpoint) {
  // Endpoint format: https://{account-name}.codesigning.azure.net
  const match = endpoint.match(/https:\/\/([^.]+)\.codesigning\.azure\.net/);
  return match ? match[1] : null;
}
