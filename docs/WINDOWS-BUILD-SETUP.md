# Windows Build Setup

This document outlines the Windows build configuration for Flint's auto-updater system.

## Current Configuration

### Icon Setup

Windows builds use the existing `build/icon.png` (1024x1024 PNG), which electron-builder automatically converts to `.ico` format during the build process.

**Configuration:**

- Production: `electron-builder.production.yml` line 17
- Canary: `electron-builder.canary.yml` line 17

```yaml
win:
  icon: 'build/icon.png'
```

### Build Commands

Windows builds are configured with separate commands for production and canary:

```bash
# Production build
npm run build:win:production

# Canary build
npm run build:win:canary
```

### GitHub Actions

The release workflow (`.github/workflows/release.yml`) now includes `windows-latest` in the build matrix (line 14):

```yaml
strategy:
  matrix:
    os: [macos-latest, windows-latest]
```

All bash-specific steps explicitly specify `shell: bash` for Windows compatibility:

- Determine release train (line 22)
- Build Electron app (Windows) (line 124)
- Configure R2 credentials (line 146)
- Deploy to R2 (line 158)
- Determine release info (line 214)

### Code Signing (Optional)

Windows code signing is configured via environment variables:

- `CSC_LINK` - Path to .p12 certificate file or base64-encoded certificate
- `CSC_KEY_PASSWORD` - Certificate password

**Current configuration:**

- `verifyUpdateCodeSignature: false` - Update signature verification is **disabled**
- This allows auto-updates to work without a code signing certificate
- Change to `true` once you obtain a Windows code signing certificate

**Without code signing:**

- ✅ Auto-updates will work (signature verification disabled)
- ⚠️ Builds show "Unknown Publisher" warnings during installation
- ⚠️ Users will see Windows Defender SmartScreen warnings

**With code signing:**

- ✅ No "Unknown Publisher" warnings
- ✅ Better user trust and fewer SmartScreen warnings
- ✅ Can enable `verifyUpdateCodeSignature: true` for secure update verification

**To obtain a Windows code signing certificate:**

1. Purchase from a Certificate Authority (Sectigo, DigiCert, etc.)
2. Typical cost: $100-400/year
3. Requires business verification
4. Export as .p12/.pfx file

**GitHub Secrets:**

- `CSC_LINK` - Base64-encoded certificate (same variable name as macOS, different cert)
- `CSC_KEY_PASSWORD` - Certificate password

### Update Artifacts

Windows builds generate the following files for auto-updates:

- `flint-{version}-setup.exe` - NSIS installer
- `latest.yml` - Update metadata for electron-updater
- `*.blockmap` - Binary diff files for delta updates

All files are automatically uploaded to R2 bucket by the release workflow.

## Testing Locally

To test Windows builds locally (requires Windows or Wine):

```bash
npm run build:win:production
# or
npm run build:win:canary
```

Output will be in `dist/` directory.

## macOS vs Windows Code Signing

### Platform Differences

**macOS:**
- ✅ **Already configured and working** with notarization
- Uses Apple Developer certificate
- Gatekeeper provides built-in signature verification
- Auto-updates are secure and verified automatically

**Windows:**
- ⚠️ **Currently unsigned** (signature verification disabled)
- Can be enabled independently when you obtain a certificate
- `verifyUpdateCodeSignature: false` allows updates without signing
- Users see SmartScreen warnings but updates still work

### Independent Configuration

You can have different code signing status for each platform:

| Platform | Code Signing | Update Verification | Auto-Updates |
|----------|--------------|---------------------|--------------|
| macOS    | ✅ Signed & Notarized | ✅ Built-in (Gatekeeper) | ✅ Works |
| Windows  | ❌ Unsigned | ❌ Disabled | ✅ Works |

When you obtain a Windows certificate later:

1. Add `CSC_LINK` and `CSC_KEY_PASSWORD` GitHub secrets (Windows cert)
2. Change `verifyUpdateCodeSignature: false` → `true`
3. macOS signing continues to work independently

## Known Limitations

### Current Windows Setup (Unsigned)

The current configuration prioritizes **getting Windows builds working** over maximum security:

- ✅ Auto-updates work without certificate
- ⚠️ "Unknown Publisher" warnings during installation
- ⚠️ Windows Defender SmartScreen warnings
- 🔒 Less secure than signed updates (no signature verification)

### Current Status

The configuration is **fully set up** for Windows builds with the following status:

- ✅ Icon configuration
- ✅ Build scripts
- ✅ GitHub Actions workflow
- ✅ R2 deployment
- ⚠️ Code signing (optional, requires certificate purchase)

## Next Steps

To enable production Windows releases:

1. **Test local Windows build** (optional)
2. **Obtain code signing certificate** (recommended for production)
3. **Add GitHub secrets** for code signing credentials
4. **Tag a release** to trigger automated build and deployment

Example release:

```bash
# Production Windows release
npm version 0.2.2
git push origin main
git push origin v0.2.2
```

GitHub Actions will automatically:

1. Build for both macOS and Windows
2. Sign (if certificates configured)
3. Upload to appropriate R2 bucket
4. Create GitHub release

## Troubleshooting

### Build fails on Windows runner

- Check that `shell: bash` is specified for all bash-syntax steps
- Verify Node.js version compatibility (currently Node 20)
- Check npm dependency installation succeeded

### Code signing errors

- Ensure `CSC_LINK` contains base64-encoded .p12 file
- Verify `CSC_KEY_PASSWORD` matches certificate password
- Check certificate is valid and not expired
- Windows requires Authenticode-compatible certificates

### Update not working

- Verify `latest.yml` was uploaded to R2
- Check R2 bucket has public access enabled
- Ensure update URL in config matches R2 custom domain
- Verify signature verification matches signing status

## Cost Considerations

**Windows Code Signing Certificate:**

- Standard certificates: $100-400/year
- EV (Extended Validation) certificates: $300-600/year
- EV certificates provide immediate SmartScreen reputation
- Standard certificates require reputation building over time
