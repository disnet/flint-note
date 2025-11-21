# Windows Code Signing with Microsoft Trusted Signing

This guide covers setting up Microsoft Trusted Signing for code signing Windows builds of Flint.

## Overview

Microsoft Trusted Signing is a cloud-based code signing service that provides:

- Instant SmartScreen reputation (like EV certificates)
- Pay-as-you-go pricing (~$10-13/month for typical usage)
- No certificate files or hardware tokens to manage
- Cloud-based signing through Azure

## Prerequisites

- Azure account (free tier works)
- Business identity for verification
- Credit card for Azure billing

## Part 1: Azure Portal Setup (Manual Steps)

### Step 1: Create Trusted Signing Account

1. Go to [Azure Portal](https://portal.azure.com)
2. Search for "Trusted Signing" in the search bar
3. Click "Create" to create a new Trusted Signing account
4. Fill in:
   - **Subscription**: Choose your Azure subscription
   - **Resource Group**: Create new or use existing
   - **Region**: Choose closest region (e.g., East US, West Europe)
   - **Pricing tier**: Choose "Basic" (Standard tier at $0.30/signing operation)
5. Click "Review + Create" then "Create"

### Step 2: Create Certificate Profile

1. Once the Trusted Signing account is created, open it
2. Go to "Certificate profiles" in the left menu
3. Click "+ Create"
4. Fill in:
   - **Profile name**: `FlintCodeSigning` (or your preferred name)
   - **Identity validation**: Choose "Public" or "Private"
   - **Certificate type**: "Public trust" for Windows code signing
5. Click "Create"

### Step 3: Identity Verification

Microsoft will verify your business identity. This process:

- Takes 3-5 business days typically
- Requires business documentation (similar to EV certificate verification)
- You'll receive emails about verification status

**Documents typically needed:**

- Business registration documents
- Proof of business address
- Government-issued ID for authorized representative

### Step 4: Get Required Information

Once verified, collect these values from Azure Portal:

1. **Trusted Signing Account Endpoint**
   - In your Trusted Signing account, go to "Overview"
   - Copy the "Account Endpoint URL" (e.g., `https://xxx.codesigning.azure.net`)

2. **Certificate Profile Name**
   - From the certificate profile you created (e.g., `FlintCodeSigning`)

3. **Azure Tenant ID, Client ID, and Client Secret**
   - Go to "Azure Active Directory" (or "Microsoft Entra ID")
   - Click "App registrations" → "New registration"
   - Name it "Flint Code Signing" → Register
   - Copy the **Application (client) ID** and **Directory (tenant) ID**
   - Go to "Certificates & secrets" → "New client secret"
   - Create a secret and copy the **Value** (you won't see it again!)

4. **Grant Permissions**
   - Go back to your Trusted Signing account
   - Click "Access control (IAM)" → "Add role assignment"
   - Select "Trusted Signing Certificate Profile Signer" role
   - Assign to your App Registration
   - Click "Review + assign"

## Part 2: Local Configuration (Automated)

The code configuration has been set up with:

- Custom signing script at `build/azure-sign.js`
- Updated electron-builder configurations
- Required npm dependencies

### Environment Variables

Create a `.env.local` file (ignored by git) with:

```bash
# Azure Trusted Signing Configuration
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_SIGNING_ENDPOINT=https://xxx.codesigning.azure.net
AZURE_CERTIFICATE_PROFILE=FlintCodeSigning
```

## Part 3: GitHub Actions Setup (CI/CD)

The release workflow is **ready but signing is currently disabled** until you add Azure credentials.

### Current Behavior

**Without Azure credentials:**

- ✅ Builds complete successfully
- ⚠️ Installers are **unsigned** (Windows shows "Unknown Publisher" warnings)
- 📝 Build logs show: "Azure Trusted Signing credentials not configured - skipping code signing"

**With Azure credentials:**

- ✅ Builds complete successfully
- ✅ Installers are **signed** (No Windows warnings)
- 📝 Build logs show: "Successfully signed {file}"

### Adding GitHub Secrets (When Ready)

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each of these:

| Secret Name                 | Value                               | Description                   |
| --------------------------- | ----------------------------------- | ----------------------------- |
| `AZURE_TENANT_ID`           | Your Azure tenant ID                | From app registration         |
| `AZURE_CLIENT_ID`           | Your Azure client ID                | From app registration         |
| `AZURE_CLIENT_SECRET`       | Your client secret value            | From app registration         |
| `AZURE_SIGNING_ENDPOINT`    | `https://xxx.codesigning.azure.net` | From Trusted Signing account  |
| `AZURE_CERTIFICATE_PROFILE` | `FlintCodeSigning`                  | Your certificate profile name |

### Workflow Configuration

The GitHub Actions workflow (`.github/workflows/release.yml`) is already configured to:

- Build on `windows-latest` runner (required for SignTool)
- Load Azure credentials from secrets
- Sign Windows installers during release builds
- Upload signed installers to R2

### Testing the Workflow

Create a test release to verify signing works:

```bash
# Tag a canary release
git tag v0.11.3-canary.1
git push origin v0.11.3-canary.1
```

The workflow will:

1. Build the Windows installer on Windows runner
2. Sign it using Azure Trusted Signing
3. Upload to your canary R2 bucket

Check the Actions tab to monitor progress and see any errors.

### Enabling Signature Verification (Final Step)

Once signing is working and you've verified signed builds are being produced:

1. Edit `electron-builder.production.yml` and `electron-builder.canary.yml`
2. Change `verifyUpdateCodeSignature: false` to `verifyUpdateCodeSignature: true`
3. Commit and push the changes

This enables auto-update signature verification, which ensures users only install authentic updates signed by you.

**Important:** Only enable this after signing is working, otherwise auto-updates will fail!

## Building Signed Windows Installer

Once everything is set up:

```bash
# Load environment variables
source .env.local  # or set them in your shell

# Build signed Windows installer
npm run build:win:production
```

The signing will happen automatically during the build process.

## Pricing Estimate

- **Base service fee**: $9.99/month (only charged if you sign anything that month)
- **Per signature**: $0.30 (Standard tier) or $0.50 (Premium tier)

**Example costs:**

- 4 releases/month = $9.99 + (4 × $0.30) = ~$11/month
- 10 releases/month = $9.99 + (10 × $0.30) = ~$13/month

Much cheaper than traditional EV certificates at $400-600/year!

## Troubleshooting

### "Authentication failed"

- Verify your Azure credentials are correct
- Check that the app registration has the correct permissions
- Ensure client secret hasn't expired

### "Certificate profile not found"

- Verify the certificate profile name matches exactly
- Check that identity verification is complete

### "Access denied"

- Verify the app registration has "Trusted Signing Certificate Profile Signer" role
- Check that permissions have propagated (can take a few minutes)

## References

- [Microsoft Trusted Signing Documentation](https://learn.microsoft.com/en-us/azure/trusted-signing/)
- [Trusted Signing Pricing](https://azure.microsoft.com/en-us/pricing/details/trusted-signing/)
