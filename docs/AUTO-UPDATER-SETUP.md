# Flint Auto-Updater System

This document explains how the auto-updater system works and provides instructions for setting up Cloudflare R2 for hosting updates.

## Overview

The Flint application uses `electron-updater` to provide automatic application updates. The system is designed for private/proprietary applications and uses Cloudflare R2 for cost-effective, reliable distribution with zero egress fees.

**Current Version:** The application is currently at version 0.1.0 (as specified in `package.json`). Auto-updates will only trigger when a higher version number is available on the update server.

## Architecture

### Components

1. **AutoUpdaterService** (`src/main/auto-updater-service.ts`)
   - Manages all update logic in the main process
   - Handles update checking, downloading, and installation
   - Provides IPC communication with the renderer process

2. **Update UI** (`src/renderer/src/components/UpdateNotification.svelte`)
   - User interface for update notifications
   - Progress tracking for downloads
   - Release notes display

3. **IPC Layer** (`src/preload/index.ts`)
   - Secure communication between main and renderer processes
   - Type-safe API for update operations

4. **Configuration** (`electron-builder.yml`)
   - Build configuration for different platforms
   - Update server URL configuration

### Update Flow

```mermaid
graph TD
    A[App Startup] --> B[Check for Updates]
    B --> C{Update Available?}
    C -->|No| D[Continue Normal Operation]
    C -->|Yes| E[Show Update Notification]
    E --> F[User Choice]
    F -->|Download| G[Download Update]
    F -->|Later| D
    G --> H[Show Download Progress]
    H --> I[Update Downloaded]
    I --> J[User Choice]
    J -->|Install Now| K[Restart & Install]
    J -->|Install Later| L[Install on Next Quit]
    K --> M[App Restarts with New Version]
    L --> D
```

## Features

### Automatic Update Checking

- Can be configured with custom intervals (default not set - must be enabled manually)
- Manual check via "Check for Updates" button
- Optional startup check with configurable delay (10 seconds by default)

### User Control

- Users can choose when to download updates
- Users can choose when to install updates
- Release notes display for informed decisions

### Progress Tracking

- Real-time download progress
- Error handling with user feedback
- Retry functionality for failed operations

### Configuration Options

- Auto-download toggle (default: false - users must manually trigger downloads)
- Auto-install on quit toggle (default: true)
- Allow prerelease updates
- Allow downgrade to older versions

## File Structure

```
src/
├── main/
│   ├── auto-updater-service.ts     # Core auto-updater logic
│   └── index.ts                    # Main process integration
├── preload/
│   └── index.ts                    # IPC API definitions
└── renderer/src/
    ├── components/
    │   ├── UpdateNotification.svelte # Update UI component
    │   └── Settings.svelte          # Settings integration
    └── env.d.ts                     # Type definitions
```

## Cloudflare R2 Setup

### Prerequisites

- Cloudflare account (free tier available)
- Wrangler CLI installed (optional, for local testing): `npm install -g wrangler`

### Why Cloudflare R2?

- **Zero egress fees** - No bandwidth charges for downloads
- **S3-compatible API** - Works with existing tools
- **Global CDN** - Fast downloads worldwide via Cloudflare's network
- **Cost-effective** - Pay only for storage (~$0.015/GB/month) and minimal operation fees

### Step 1: Create R2 Bucket

1. **Log into Cloudflare Dashboard:**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Navigate to R2 Object Storage

2. **Create a bucket:**
   - Click "Create bucket"
   - Name it (e.g., `flint-updates`)
   - Choose a location (Automatic is recommended)

3. **Enable public access:**
   - Go to bucket Settings → Public Access
   - Click "Connect Domain" or "Allow Access"
   - Note the public R2.dev URL (e.g., `https://pub-xxxxx.r2.dev`)
   - Or connect a custom domain (e.g., `updates.yourdomain.com`)

### Step 2: Create API Token

1. **Generate R2 API Token:**
   - In Cloudflare Dashboard → R2 → Manage R2 API Tokens
   - Click "Create API token"
   - Permissions: Object Read & Write
   - Scope to your specific bucket (optional but recommended)
   - Save the Access Key ID and Secret Access Key

### Step 3: Update Application Configuration

1. **Update `electron-builder.yml`:**

   ```yaml
   publish:
     provider: generic
     url: https://pub-xxxxx.r2.dev # or https://updates.yourdomain.com
   ```

   **Important:** The current configuration uses `https://updates.flint-note.rocks` as a placeholder. You must update this URL to your actual R2 public URL before deploying.

2. **For multiple environments, create separate R2 buckets:**

   ```yaml
   # electron-builder.yml (production)
   publish:
     provider: generic
     url: https://updates.yourdomain.com

   # dev-app-update.yml (development/staging)
   publish:
     provider: generic
     url: https://staging-updates.yourdomain.com
   ```

### Step 4: Manual Deployment (Optional)

For quick testing, you can manually upload using Wrangler CLI or AWS CLI (R2 is S3-compatible):

**Using Wrangler:**
```bash
# Install wrangler
npm install -g wrangler

# Authenticate
wrangler login

# Build the application
npm run build
npm run build:mac  # or build:win, build:linux

# Upload to R2
wrangler r2 object put flint-updates/latest.yml --file=dist/latest.yml
wrangler r2 object put flint-updates/latest-mac.yml --file=dist/latest-mac.yml
# ... upload other files
```

**Using AWS CLI (S3-compatible):**
```bash
# Configure AWS CLI with R2 credentials
aws configure --profile r2
# Enter your R2 Access Key ID and Secret Access Key
# Region: auto
# Endpoint: https://<account-id>.r2.cloudflarestorage.com

# Upload files
aws s3 sync dist/ s3://flint-updates/ --profile r2 --endpoint-url https://<account-id>.r2.cloudflarestorage.com
```

### Step 5: GitHub Actions Integration

The project includes two GitHub Actions workflows:

1. **`.github/workflows/build.yml`** - Runs on push to main/develop and PRs. Builds and tests all platforms.
2. **`.github/workflows/release.yml`** - Runs on version tags (v*). Builds signed releases and creates GitHub releases.

#### Current Release Workflow

The release workflow (`.github/workflows/release.yml`) is already configured with:
- Matrix builds for macOS and Windows
- Manual certificate import for macOS (more reliable than apple-actions)
- Automatic code signing for both platforms
- Artifact upload and GitHub release creation

#### Adding R2 Deployment

To add automatic deployment to Cloudflare R2, add a new job to `.github/workflows/release.yml` after the `create-release` job:

```yaml
  deploy-to-r2:
    needs: release
    runs-on: ubuntu-latest

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Flatten artifacts directory
        run: |
          mkdir -p dist
          find artifacts -type f -exec cp {} dist/ \;

      - name: Configure R2 credentials
        run: |
          mkdir -p ~/.aws
          cat > ~/.aws/credentials << EOF
          [r2]
          aws_access_key_id = ${{ secrets.R2_ACCESS_KEY_ID }}
          aws_secret_access_key = ${{ secrets.R2_SECRET_ACCESS_KEY }}
          EOF
          cat > ~/.aws/config << EOF
          [profile r2]
          region = auto
          endpoint_url = https://${{ secrets.CLOUDFLARE_ACCOUNT_ID }}.r2.cloudflarestorage.com
          EOF

      - name: Deploy to R2
        env:
          BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: |
          # Upload all files to R2 using S3-compatible API
          aws s3 sync dist/ s3://$BUCKET_NAME/ \
            --profile r2 \
            --endpoint-url https://${{ secrets.CLOUDFLARE_ACCOUNT_ID }}.r2.cloudflarestorage.com \
            --exclude "*.blockmap"

          # Ensure latest.yml files have proper content type
          for file in dist/latest*.yml; do
            if [ -f "$file" ]; then
              aws s3 cp "$file" s3://$BUCKET_NAME/$(basename "$file") \
                --profile r2 \
                --endpoint-url https://${{ secrets.CLOUDFLARE_ACCOUNT_ID }}.r2.cloudflarestorage.com \
                --content-type "text/yaml"
            fi
          done
```

This approach:
- Reuses artifacts from the existing build matrix
- Keeps signing and building separate from deployment
- Uses S3-compatible API (no CloudFront invalidation needed!)
- Only requires R2 secrets, not code signing secrets

#### Required GitHub Secrets

Add these secrets to your repository settings (`Settings > Secrets and variables > Actions`):

**For R2 deployment:**

- `R2_ACCESS_KEY_ID` - R2 API token Access Key ID
- `R2_SECRET_ACCESS_KEY` - R2 API token Secret Access Key
- `R2_BUCKET_NAME` - Your R2 bucket name (e.g., `flint-updates`)
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID (found in R2 dashboard)

**For Windows code signing:**
- `CSC_LINK` - Base64-encoded .p12 certificate file for Windows
- `CSC_KEY_PASSWORD` - Certificate password for Windows

**For macOS code signing and notarization:**
- `CSC_LINK` - Base64-encoded .p12 certificate file for macOS (same variable name, different certificate)
- `CSC_KEY_PASSWORD` - Certificate password for macOS
- `APPLE_ID` - Your Apple ID email
- `APPLE_ID_PASSWORD` - App-specific password for notarization
- `APPLE_TEAM_ID` - Your Apple Developer Team ID

**Note:** If you're building for both platforms, `CSC_LINK` and `CSC_KEY_PASSWORD` can be reused if you use the same certificate format, or you can set them conditionally per platform in the workflow.

#### Getting R2 Credentials

1. **Access Key and Secret:**
   - Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
   - Click "Create API token"
   - Give it a name (e.g., "GitHub Actions - Flint Updates")
   - Permissions: Object Read & Write
   - Optionally scope to specific bucket
   - Copy both the Access Key ID and Secret Access Key
   - Add as `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in GitHub secrets

2. **Account ID:**
   - Found in Cloudflare Dashboard → R2 (in the URL or sidebar)
   - Format: 32-character hex string
   - Add as `CLOUDFLARE_ACCOUNT_ID` in GitHub secrets

3. **Bucket Name:**
   - The name you gave your bucket (e.g., `flint-updates`)
   - Add as `R2_BUCKET_NAME` in GitHub secrets

#### Triggering Releases

To deploy a new version:

1. Update version in `package.json`
2. Commit changes: `git commit -am "Release v1.0.1"`
3. Create and push tag: `git tag v1.0.1 && git push origin v1.0.1`
4. GitHub Actions will automatically build and deploy

#### Multi-Environment Setup

For staging/production environments, create separate R2 buckets and use different secrets:

**`.github/workflows/staging.yml`** (triggers on `develop` branch):

```yaml
# Similar to above but with staging bucket
env:
  R2_BUCKET_NAME: ${{ secrets.R2_STAGING_BUCKET_NAME }}
  # Reuse same R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and CLOUDFLARE_ACCOUNT_ID
```

**`.github/workflows/production.yml`** (triggers on version tags):

```yaml
# Use production bucket as shown above
env:
  R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
```

## Security Considerations

### Code Signing

1. **Windows:** Obtain a code signing certificate and configure environment variables:

   Windows code signing is configured via environment variables (not in `electron-builder.yml`):
   - `CSC_LINK` - Path to .p12 certificate file or base64-encoded certificate
   - `CSC_KEY_PASSWORD` - Certificate password

   In `electron-builder.yml`:
   ```yaml
   win:
     executableName: flint
     publisherName: 'Your Name'
     verifyUpdateCodeSignature: true
   ```

   For local development, set environment variables:
   ```bash
   export CSC_LINK="/path/to/certificate.p12"
   export CSC_KEY_PASSWORD="your-password"
   ```

   For CI/CD, these should be set as GitHub Secrets (see GitHub Actions section below).

2. **macOS:** Configure with Apple Developer certificate:
   ```yaml
   mac:
     category: public.app-category.productivity
     identity: 'Developer ID Application: Your Name (TEAM_ID)'
     hardenedRuntime: true
     gatekeeperAssess: false
     entitlements: 'build/entitlements.mac.plist'
     entitlementsInherit: 'build/entitlements.mac.plist'
     notarize:
       teamId: 'YOUR_TEAM_ID'
   ```

## macOS Code Signing Setup

### Prerequisites

1. **Apple Developer Account** - Enrolled in Apple Developer Program ($99/year)
2. **Xcode** - Installed on macOS for certificate management
3. **Developer ID Application Certificate** - For distribution outside App Store

### Step 1: Create Certificates

1. **Log into Apple Developer Portal:**
   - Go to [developer.apple.com](https://developer.apple.com)
   - Navigate to Certificates, Identifiers & Profiles

2. **Create Developer ID Application Certificate:**
   - Click "+" to create new certificate
   - Select "Developer ID Application" (for apps distributed outside Mac App Store)
   - Follow prompts to upload Certificate Signing Request (CSR)
   - Download the certificate (.cer file)

3. **Install Certificate:**
   - Double-click the .cer file to install in Keychain Access
   - Verify it appears under "My Certificates" in Keychain Access

### Step 2: Configure Environment Variables

For local development, add to your shell profile (`.zshrc`, `.bash_profile`):

```bash
# macOS code signing
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your-apple-id@example.com"
export APPLE_ID_PASSWORD="app-specific-password"  # See below
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

### Step 3: App-Specific Password for Notarization

1. **Generate App-Specific Password:**
   - Go to [appleid.apple.com](https://appleid.apple.com)
   - Sign in with your Apple ID
   - In Security section, generate app-specific password
   - Label it "Electron App Notarization"
   - Save the generated password securely

2. **Store in Keychain (Recommended):**
   ```bash
   xcrun notarytool store-credentials "flint-notarization" \
     --apple-id "your-apple-id@example.com" \
     --team-id "YOUR_TEAM_ID" \
     --password "app-specific-password"
   ```

### Step 4: Update electron-builder Configuration

```yaml
# electron-builder.yml
mac:
  category: public.app-category.productivity
  icon: 'build/icon.icns'
  identity: 'Developer ID Application: Your Name (TEAM_ID)'
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: 'build/entitlements.mac.plist'
  entitlementsInherit: 'build/entitlements.mac.plist'
  notarize:
    teamId: 'YOUR_TEAM_ID'
```

### Step 5: Create Entitlements File

Create `build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-executable-page-protection</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

### Step 6: GitHub Actions Configuration

Update your GitHub Actions workflow with macOS signing secrets:

```yaml
# .github/workflows/release.yml
jobs:
  build-and-deploy:
    runs-on: macos-latest # Required for macOS signing

    steps:
      # ... other steps ...

      - name: Import Code Signing Certificate
        if: runner.os == 'macOS'
        uses: apple-actions/import-codesign-certs@v2
        with:
          p12-file-base64: ${{ secrets.CSC_LINK }}
          p12-password: ${{ secrets.CSC_KEY_PASSWORD }}

      - name: Build Electron packages
        run: npm run build:mac
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

### Step 7: GitHub Secrets for macOS Signing

Add these additional secrets to your repository:

- `CSC_LINK` - Base64 encoded .p12 certificate file (required for both macOS code signing and when using apple-actions/import-codesign-certs)
- `CSC_KEY_PASSWORD` - Password for the .p12 certificate
- `APPLE_ID` - Your Apple ID email (for notarization)
- `APPLE_ID_PASSWORD` - App-specific password for notarization
- `APPLE_TEAM_ID` - Your Apple Developer Team ID (for notarization)

### Step 8: Export Certificate for CI/CD

1. **Export from Keychain:**
   - Open Keychain Access
   - Find your "Developer ID Application" certificate
   - Right-click → Export
   - Choose Personal Information Exchange (.p12)
   - Set a strong password

2. **Convert to Base64:**

   ```bash
   base64 -i certificate.p12 | pbcopy
   ```

   - Paste the result into `CSC_LINK` GitHub secret

### Step 9: Testing Signing Locally

```bash
# Build and sign locally
npm run build
npm run build:mac

# Verify signature
codesign --verify --deep --strict dist/mac-arm64/Flint.app
spctl --assess --verbose dist/mac-arm64/Flint.app

# Check notarization status (after upload)
xcrun notarytool history --keychain-profile "flint-notarization"
```

Note: The build produces a universal macOS binary in `dist/mac-universal/`.

## Local Notarization Testing

This section covers how to manually notarize your macOS application locally for testing purposes before deploying through CI/CD.

**Important:** When distributing via DMG (recommended), you only need to notarize the DMG file. The notarization process checks the entire DMG contents, including the signed .app bundle inside. You do NOT need to notarize both the .app and the DMG separately.

### Prerequisites for Local Notarization

1. **Completed Code Signing Setup** - Follow all previous macOS code signing steps
2. **Built Application** - Have a signed .app or .dmg file ready
3. **Keychain Profile** - Notarytool credentials stored (from Step 3 above)

### Step 1: Build and Sign Application

```bash
# Build the application
npm run build
npm run build:mac

# Verify the build was signed
codesign --verify --deep --strict dist/mac-universal/Flint.app
```

### Step 2: Submit for Notarization

**Option A: Submit .dmg file (recommended for distribution):**

```bash
# Submit the DMG directly - this notarizes the entire DMG including the .app inside
xcrun notarytool submit dist/Flint-0.1.0-universal.dmg \
  --keychain-profile "flint-notarization" \
  --wait

# Note: --wait flag makes the command wait for completion
```

**Option B: Submit .app bundle as zip (only if not using DMG):**

```bash
# Only needed if you're distributing the .app directly without a DMG
# Create a zip of the .app bundle (required by notarytool - it doesn't accept .app directly)
cd dist/mac-universal && zip -r Flint.zip Flint.app && cd ../..

# Submit the zip file
xcrun notarytool submit dist/mac-universal/Flint.zip \
  --keychain-profile "flint-notarization" \
  --wait
```

**Which to choose?**
- If you're distributing via DMG (recommended): Only notarize the DMG
- If you're distributing the .app directly: Notarize the .app as a zip
- You do NOT need to notarize both - notarizing the DMG covers everything inside it

### Step 3: Monitor Submission Status

**Check submission without waiting:**

```bash
# Submit without waiting (use DMG for distribution)
SUBMISSION_ID=$(xcrun notarytool submit dist/Flint-0.1.0-universal.dmg \
  --keychain-profile "flint-notarization" \
  --output-format json | jq -r '.id')

# Check status manually
xcrun notarytool info $SUBMISSION_ID \
  --keychain-profile "flint-notarization"
```

Note: If you don't have `jq` installed, you can parse the output manually or use `--output-format plist`.

**View all recent submissions:**

```bash
# List recent notarization history
xcrun notarytool history \
  --keychain-profile "flint-notarization"
```

### Step 4: Handle Notarization Results

**If notarization succeeds:**

```bash
# For DMG files (recommended), staple to the DMG
xcrun stapler staple dist/Flint-0.1.0-universal.dmg

# Verify stapling worked
xcrun stapler validate dist/Flint-0.1.0-universal.dmg

# Test Gatekeeper assessment on the DMG
spctl --assess --type open --context context:primary-signature --verbose dist/Flint-0.1.0-universal.dmg

# For .app bundles only (if you notarized the .app directly):
# xcrun stapler staple dist/mac-universal/Flint.app
# xcrun stapler validate dist/mac-universal/Flint.app
# spctl --assess --verbose=2 dist/mac-universal/Flint.app
```

**Important:** Staple the same artifact you notarized (DMG or .app), not both.

**If notarization fails:**

```bash
# Get detailed logs for failed submission
xcrun notarytool log $SUBMISSION_ID \
  --keychain-profile "flint-notarization"

# Save logs to file for analysis
xcrun notarytool log $SUBMISSION_ID \
  --keychain-profile "flint-notarization" \
  > notarization-log.json
```

### Step 5: Local Testing Script

Create a script for local notarization testing (`scripts/test-notarization.sh`):

```bash
#!/bin/bash

set -e

# Configuration
APP_NAME="Flint"
VERSION=$(node -p "require('./package.json').version")
KEYCHAIN_PROFILE="flint-notarization"

echo "Starting local notarization test for $APP_NAME v$VERSION..."

# Build the application
echo "Building application..."
npm run build
npm run build:mac

# Use universal build directory
DIST_DIR="dist/mac-universal"

echo "Using dist directory: $DIST_DIR"

# Verify signing
echo "Verifying code signature..."
codesign --verify --deep --strict "$DIST_DIR/$APP_NAME.app"

# Find the DMG file
DMG_FILE=$(find dist -name "*.dmg" -type f | head -n 1)

if [ -z "$DMG_FILE" ]; then
  echo "❌ No DMG file found. Make sure the build created a DMG."
  exit 1
fi

echo "Found DMG: $DMG_FILE"

# Submit DMG for notarization
echo "Submitting DMG for notarization..."
SUBMISSION_ID=$(xcrun notarytool submit "$DMG_FILE" \
  --keychain-profile "$KEYCHAIN_PROFILE" \
  --output-format json | jq -r '.id')

echo "Submission ID: $SUBMISSION_ID"
echo "Waiting for notarization to complete..."

# Wait for completion (timeout after 10 minutes)
TIMEOUT=600
ELAPSED=0
INTERVAL=30

while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(xcrun notarytool info "$SUBMISSION_ID" \
    --keychain-profile "$KEYCHAIN_PROFILE" \
    --output-format json | jq -r '.status')

  echo "Status: $STATUS (${ELAPSED}s elapsed)"

  if [ "$STATUS" = "Accepted" ]; then
    echo "✅ Notarization successful!"

    # Staple the ticket to the DMG
    echo "Stapling notarization ticket to DMG..."
    xcrun stapler staple "$DMG_FILE"

    # Verify stapling
    echo "Verifying staple..."
    xcrun stapler validate "$DMG_FILE"

    # Test Gatekeeper on the DMG
    echo "Testing Gatekeeper assessment..."
    spctl --assess --type open --context context:primary-signature --verbose "$DMG_FILE"

    echo "✅ Local notarization test completed successfully!"
    echo "✅ DMG is ready for distribution: $DMG_FILE"
    exit 0
  elif [ "$STATUS" = "Invalid" ]; then
    echo "❌ Notarization failed!"
    echo "Fetching logs..."
    xcrun notarytool log "$SUBMISSION_ID" \
      --keychain-profile "$KEYCHAIN_PROFILE" \
      > "notarization-log-$SUBMISSION_ID.json"
    echo "Logs saved to: notarization-log-$SUBMISSION_ID.json"
    exit 1
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "❌ Notarization timed out after ${TIMEOUT} seconds"
exit 1
```

Make it executable:

```bash
chmod +x scripts/test-notarization.sh
```

### Step 6: Common Local Testing Scenarios

**Test with different build configurations:**

```bash
# Test production build
npm run build
npm run build:mac

# Submit the DMG for notarization
DMG_FILE=$(find dist -name "*.dmg" -type f | head -n 1)
xcrun notarytool submit "$DMG_FILE" --keychain-profile "flint-notarization" --wait

# If successful, staple the ticket
xcrun stapler staple "$DMG_FILE"
```

**Batch testing multiple artifacts:**

```bash
# Build all platforms
npm run build
npm run build:win
npm run build:mac
npm run build:linux

# Submit macOS DMG files for notarization
find dist -name "*.dmg" -exec xcrun notarytool submit {} \
  --keychain-profile "flint-notarization" \;
```

### Step 7: Troubleshooting Local Notarization

**Common Issues and Solutions:**

1. **Bundle format rejected:**
   ```bash
   # Check bundle structure
   find dist/mac-universal/Flint.app -name "*.dylib" -o -name "*.so"

   # Verify all binaries are signed
   find dist/mac-universal/Flint.app -type f -perm +111 -exec codesign --verify {} \;
   ```

2. **Hardened runtime violations:**
   ```bash
   # Check entitlements
   codesign -d --entitlements - dist/mac-universal/Flint.app

   # Verify entitlements file is properly configured
   plutil -lint build/entitlements.mac.plist
   ```

3. **Credential issues:**
   ```bash
   # Verify keychain profile
   xcrun notarytool history --keychain-profile "flint-notarization"

   # Test with environment variables instead of keychain profile
   export APPLE_ID="your-apple-id@example.com"
   export APPLE_ID_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="YOUR_TEAM_ID"

   # Submit DMG with credentials
   DMG_FILE=$(find dist -name "*.dmg" -type f | head -n 1)
   xcrun notarytool submit "$DMG_FILE" \
     --apple-id "$APPLE_ID" \
     --password "$APPLE_ID_PASSWORD" \
     --team-id "$APPLE_TEAM_ID"
   ```

### Best Practices for Local Testing

1. **Test Early and Often** - Don't wait until release to test notarization
2. **Keep Logs** - Save notarization logs for debugging patterns
3. **Verify Stapling** - Always test stapling after successful notarization
4. **Test Different Environments** - Test both development and production builds
5. **Monitor Timing** - Track how long notarization takes for your app size

### Integration with Development Workflow

Add notarization testing to your development process:

```bash
# Add to package.json scripts
{
  "scripts": {
    "test:notarize": "./scripts/test-notarization.sh",
    "build:test": "npm run build && npm run test:notarize"
  }
}
```

This allows developers to test notarization locally with:

```bash
npm run test:notarize
```

### Troubleshooting macOS Signing

1. **Certificate Issues:**

   ```bash
   # List available certificates
   security find-identity -v -p codesigning

   # Verify certificate chain
   security verify-cert -c certificate.cer
   ```

2. **Notarization Failures:**

   ```bash
   # Check notarization logs
   xcrun notarytool log <submission-id> --keychain-profile "flint-notarization"
   ```

3. **Common Issues:**
   - **"No identity found"** - Certificate not installed or expired
   - **"Hardened runtime violations"** - Missing entitlements
   - **"Notarization failed"** - Check logs for specific violations

### Cost Considerations

- **Apple Developer Program:** $99/year (required)
- **Code signing is included** in the developer program
- **Notarization is free** but requires valid developer account

### Content Security

1. **Use HTTPS only** for update distribution
2. **Implement checksums** verification (electron-updater does this automatically)
3. **Keep update server logs** for security monitoring
4. **Regular security updates** for dependencies

## Monitoring and Analytics

### Cloudflare Analytics

Cloudflare provides built-in analytics for R2:

- Storage usage and trends
- Request metrics (Class A and Class B operations)
- No egress bandwidth tracking needed (it's free!)
- View in Cloudflare Dashboard → R2 → Your bucket → Metrics

### Application Metrics

Track update metrics in your application:

```typescript
// Example metrics collection
const updateMetrics = {
  version: currentVersion,
  updateCheckTime: Date.now(),
  downloadTime: downloadDuration,
  installSuccess: true / false,
  errorMessage: errorDetails
};
```

## Troubleshooting

### Common Issues

1. **Update check failures:**
   - Verify R2 public URL is accessible
   - Check that public access is enabled on the bucket
   - Validate YAML file format in deployed files
   - Ensure all required files (latest.yml, latest-mac.yml, etc.) are deployed

2. **Download failures:**
   - Check that R2 bucket has public access enabled
   - Verify file paths in latest.yml match deployed file names
   - Ensure Content-Type headers are correct (especially for .yml files)

3. **404 errors:**
   - Ensure all build artifacts are uploaded to R2
   - Check that file names in latest.yml match actual file names in R2
   - Verify R2 bucket name and endpoint URL are correct
   - Check that public R2.dev domain or custom domain is properly configured

4. **CORS errors:**
   - R2 public buckets should handle CORS automatically
   - If using custom domain, ensure CORS headers are configured
   - Check browser console for specific CORS error messages

### Debug Mode

Enable debug logging in development:

```typescript
// In main process
process.env.ELECTRON_ENABLE_LOGGING = true;
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
```

### Testing Updates Locally

Local testing allows you to verify the auto-update mechanism without deploying to production. This is essential for debugging update flows, UI behavior, and error handling.

#### Quick Start with Automated Script

The easiest way to test auto-updates locally is using the provided test script:

```bash
# Set up test environment and start HTTP server
./scripts/test-auto-update.sh setup

# This will:
# 1. Read current version from package.json (e.g., 0.1.1)
# 2. Build "old" version using current version
# 3. Build "new" version using current version + 1 (e.g., 0.1.2)
# 4. Show instructions for testing
# 5. Start HTTP server in foreground (serving the new version)

# The server runs in the foreground - press Ctrl+C to stop when done

# After stopping the server, clean up:
npm run clean
```

**Available commands:**
- `./scripts/test-auto-update.sh setup` - Build versions and start server (Ctrl+C to stop)
- `./scripts/test-auto-update.sh status` - Check test environment status
- `./scripts/test-auto-update.sh logs` - Monitor app logs (tail -f)
- `./scripts/test-auto-update.sh help` - Show help
- `npm run clean` - Remove test artifacts

**Directory structure:**
- `build-autoupdate/old/` - Old version DMG for installation
- `build-autoupdate/new/` - New version files served by HTTP server

#### Manual Testing (Advanced)

If you prefer to set up the test environment manually or need more control:

**Prerequisites:**

- Node.js and npm installed
- Built application packages
- HTTP server (http-server or similar)

#### Step 1: Build Two Versions of Your App

To test updates, you need an "old" version to upgrade from and a "new" version to upgrade to.

**Build Version 1 (Current/Old Version):**

```bash
# Make sure package.json has a lower version (e.g., 0.1.0)
npm run build
npm run build:mac

# Rename the output to preserve it
mv dist/Flint-0.1.0-universal.dmg dist/Flint-0.1.0-universal-OLD.dmg
mv dist/latest-mac.yml dist/latest-mac-OLD.yml
```

**Build Version 2 (New Version):**

```bash
# Update version in package.json to a higher version (e.g., 0.1.1)
# Edit package.json: "version": "0.1.1"

npm run build
npm run build:mac

# The new version artifacts will be in dist/
# - Flint-0.1.1-universal.dmg
# - latest-mac.yml (pointing to the new version)
```

#### Step 2: Set Up Local Update Server

Create a directory to serve updates from:

```bash
# Create a directory for the update server
mkdir local-update-server
cd local-update-server

# Copy the NEW version artifacts here
cp ../dist/Flint-0.1.1-universal.dmg .
cp ../dist/latest-mac.yml .

# Start http-server (using npx, no global install needed)
npx http-server . -p 3000 --cors
```

The server should now be running at `http://localhost:3000` and serving:
- `latest-mac.yml` (update metadata)
- `Flint-0.1.1-universal.dmg` (the new version - for initial installation)
- `Flint-0.1.1-mac.zip` (the new version - for auto-updates)

**Note:** macOS auto-updater requires ZIP files for updates, not DMG files. The DMG is only used for initial installation.

#### Step 3: Verify dev-app-update.yml Configuration

The `dev-app-update.yml` file should be configured to point to your local server:

```yaml
provider: generic
url: http://localhost:3000
```

This file is already set up in the project root. Electron-updater will use this in development mode.

#### Step 4: Install the Old Version

```bash
# Install the OLD version (0.1.0) on your system
# Open the DMG and drag to Applications
open dist/Flint-0.1.0-universal-OLD.dmg
```

Install it like a normal application. This will be the version that checks for updates.

#### Step 5: Run the App in Development Mode

**Option A: Run from source (development build)**

This simulates production update checking behavior:

```bash
# Make sure dev-app-update.yml is configured
# The app will use dev-app-update.yml in development mode
npm run dev
```

**Option B: Run the installed production app**

For more realistic testing, run the installed app directly:

```bash
# Run the installed OLD version
/Applications/Flint.app/Contents/MacOS/Flint
```

**Important:** Production apps only check for updates if they detect they're not in development mode. You may need to temporarily modify `src/main/index.ts` to force update checking:

```typescript
// Temporarily change this line for testing:
// if (!is.dev) {
if (true) {  // Force update check even in dev
  autoUpdaterService.checkForUpdatesOnStartup();
}
```

#### Step 6: Test the Update Flow

1. **Open the app** (either via `npm run dev` or the installed app)

2. **Trigger an update check:**
   - Go to Settings (⚙️ in sidebar)
   - Click "Check for Updates" button
   - Or wait 10 seconds for automatic startup check

3. **Expected behavior:**
   - You should see "Checking for update..." briefly
   - An update notification should appear showing version 0.1.1 is available
   - Click "Show Details" to see release notes (if any)
   - Click "Download" to download the update

4. **During download:**
   - Progress bar should show download percentage
   - Console logs should show download progress

5. **After download completes:**
   - Notification changes to "Update Ready"
   - Two options appear: "Install Later" or "Restart & Install"
   - Click "Restart & Install" to test the installation

6. **After restart:**
   - App should restart with the new version (0.1.1)
   - Check the version in Settings or About

#### Step 7: Test Different Scenarios

**Scenario 1: No Update Available**

```bash
# In local-update-server, modify latest-mac.yml
# Change version to match the installed version (0.1.0)
# Click "Check for Updates" - should show "up to date"
```

**Scenario 2: Update Error**

```bash
# Stop the http-server
# Click "Check for Updates"
# Should show error notification with retry option
```

**Scenario 3: Interrupted Download**

```bash
# Start downloading an update
# Stop http-server mid-download
# Should show error with retry option
```

**Scenario 4: Auto-Install on Quit**

```bash
# Download an update but click "Install Later"
# The update should install when you quit the app normally
```

#### Debugging Tips

**Enable Debug Logging:**

Add this to `src/main/auto-updater-service.ts` constructor:

```typescript
constructor() {
  // Enable detailed logging
  autoUpdater.logger = logger;
  autoUpdater.logger.transports.file.level = 'debug';

  this.setupAutoUpdater();
  this.setupIpcHandlers();
}
```

**Check Electron Updater Logs:**

```bash
# macOS logs location
~/Library/Logs/Flint/main.log

# Or watch logs in real-time
tail -f ~/Library/Logs/Flint/main.log
```

**Common Issues:**

1. **"Cannot find channel file latest-mac.yml"**
   - Ensure `latest-mac.yml` is in the http-server root directory
   - Check that http-server is running on port 3000
   - Verify `dev-app-update.yml` URL is correct

2. **Update not detected**
   - Verify version in `latest-mac.yml` is higher than installed version
   - Check that `latest-mac.yml` contains correct file paths
   - Ensure http-server has CORS enabled (`--cors` flag)

3. **Download fails / "ZIP file not provided" error**
   - macOS auto-updater requires ZIP files, not DMG
   - Ensure both ZIP and DMG are built: add `zip` target in `electron-builder.yml`
   - Check that ZIP file exists in http-server directory
   - Verify file name in `latest-mac.yml` matches actual ZIP file name
   - Check http-server logs for 404 errors

4. **App doesn't check for updates**
   - Verify AutoUpdaterService is initialized (not commented out)
   - Check that main window is set: `autoUpdaterService.setMainWindow(mainWindow)`
   - For production apps, ensure `is.dev` check is bypassed for testing

#### Inspecting latest-mac.yml

The `latest-mac.yml` file should look like this:

```yaml
version: 0.1.1
files:
  - url: Flint-0.1.1-mac.zip
    sha512: [base64-encoded-hash]
    size: 123456789
path: Flint-0.1.1-mac.zip
sha512: [base64-encoded-hash]
releaseDate: '2024-01-15T10:30:00.000Z'
```

**Important fields:**
- `version`: Must be higher than installed version (using semver comparison)
- `files[0].url`: Filename or URL to download (must be ZIP for macOS auto-updates)
- `path`: Same as `files[0].url` for generic provider
- `sha512`: Used to verify download integrity

**Note:** The `latest-mac.yml` file should reference the ZIP file, not the DMG. electron-builder generates this automatically with the correct file references when you include the `zip` target in your build configuration.

#### Staging Environment Testing

For team testing, set up a staging environment:

1. **Create staging R2 bucket:**
   - Bucket name: `flint-updates-staging`
   - Public URL: `https://staging-updates.flintnote.com`

2. **Update `dev-app-update.yml`:**
   ```yaml
   provider: generic
   url: https://staging-updates.flintnote.com
   ```

3. **Deploy to staging:**
   ```bash
   # Build staging version
   npm run build
   npm run build:mac

   # Upload to staging R2 bucket
   aws s3 sync dist/ s3://flint-updates-staging/ \
     --profile r2 \
     --endpoint-url https://[account-id].r2.cloudflarestorage.com
   ```

4. **Test with team:**
   - Share staging builds with team
   - Everyone tests against staging update server
   - Verify updates work before deploying to production

#### Cleanup After Testing

```bash
# Stop http-server (Ctrl+C)

# Remove test artifacts
rm -rf local-update-server

# Uninstall test versions if needed
rm -rf /Applications/Flint.app

# Revert any temporary code changes
# - Restore version in package.json
# - Remove forced update check bypass
```

#### Automated Testing (Advanced)

For CI/CD integration, consider automating update testing:

```bash
#!/bin/bash
# test-updates.sh - Automated update testing script

set -e

echo "Building old version..."
npm version 0.1.0 --no-git-tag-version
npm run build && npm run build:mac
cp dist/Flint-0.1.0-universal.dmg test-artifacts/

echo "Building new version..."
npm version 0.1.1 --no-git-tag-version
npm run build && npm run build:mac

echo "Starting update server..."
cp dist/* local-update-server/
npx http-server local-update-server -p 3000 &
SERVER_PID=$!

echo "Installing old version..."
# Install and test update mechanism
# (This would require additional automation tools)

echo "Cleanup..."
kill $SERVER_PID
```

### Production Update Testing

Before deploying to production, test with your actual R2 server:

1. Deploy a test version to R2 with a pre-release version number (e.g., 0.1.1-beta.1)
2. Configure `electron-builder.yml` to allow pre-releases:
   ```yaml
   publish:
     provider: generic
     url: https://updates.flintnote.com
   ```
3. In `src/main/auto-updater-service.ts`, temporarily enable pre-releases:
   ```typescript
   autoUpdater.allowPrerelease = true;
   ```
4. Test the full update flow against production infrastructure
5. Revert pre-release settings before final production release

## Cost Estimation

### Cloudflare R2 Costs

**Free Tier includes (per month):**
- 10GB storage
- 1 million Class A operations (writes, lists)
- 10 million Class B operations (reads)
- **Unlimited egress bandwidth** (completely free!)

**Paid Pricing (above free tier):**
- **Storage:** $0.015/GB/month
- **Class A operations:** $4.50 per million
- **Class B operations:** $0.36 per million
- **Egress bandwidth:** $0 (always free!)

**Real-World Examples:**

**Example 1: 1,000 monthly updates (500MB app)**
- Storage: 0.5GB = ~$0.01/month
- Bandwidth: 500GB = **$0** (free!)
- Operations: ~1,000 reads = $0.00036
- **Total: ~$0.01/month** 🎉

**Example 2: 10,000 monthly updates (500MB app)**
- Storage: 0.5GB = ~$0.01/month
- Bandwidth: 5TB = **$0** (free!)
- Operations: ~10,000 reads = $0.0036
- **Total: ~$0.01/month** 🎉

**Example 3: 100,000 monthly updates (500MB app)**
- Storage: 0.5GB = ~$0.01/month
- Bandwidth: 50TB = **$0** (free!)
- Operations: ~100,000 reads = $0.036
- **Total: ~$0.05/month** 🎉

**Cost Comparison (10TB bandwidth/month):**
- Vercel: $4,000
- Netlify: $2,000
- AWS CloudFront: $900
- **Cloudflare R2: $0.01** ⚡️

### Why R2 is So Cheap

The secret is **zero egress fees**. Traditional CDNs (including AWS CloudFront, Netlify, Vercel) charge for data transfer out to users. R2 eliminates this completely, making it ideal for bandwidth-heavy applications like Electron app updates.

## Backup and Disaster Recovery

1. **Version Control:** Keep all release artifacts in GitHub releases as backup
2. **Multiple Buckets:** Create backup R2 buckets in different Cloudflare regions
3. **Local Backup:** Keep copies of all release builds locally
4. **R2 Versioning:** Consider enabling object versioning in R2 for additional protection

## Conclusion

The auto-updater system provides a robust, secure way to distribute updates to your Flint application users. The Cloudflare R2 setup ensures global availability through Cloudflare's CDN, fast download speeds, and unbeatable cost-effectiveness with zero egress fees.

**Benefits of Cloudflare R2 for updates:**
- **Zero egress bandwidth costs** - No charges for downloads, no matter the scale
- **S3-compatible API** - Works with existing AWS tools and libraries
- **Automatic HTTPS and global CDN** - Fast downloads worldwide
- **Generous free tier** - 10GB storage and 10M reads/month free
- **Simple setup** - Easier than AWS, cheaper than Netlify/Vercel
- **No cache invalidation** - Updates are immediately available
- **Predictable costs** - Pay only for storage (~$0.015/GB/month)

**Perfect for:**
- Electron app updates (bandwidth-heavy, cost-sensitive)
- Any application with frequent or large downloads
- Startups wanting to minimize infrastructure costs
- Applications with unpredictable bandwidth spikes

For additional security in enterprise environments, consider implementing Cloudflare Workers for authentication or rate limiting.
