# Dual-Train Update System Implementation

This document summarizes the implementation of the production and canary update trains for Flint.

## Overview

Flint now supports two separate update channels (trains) for safe testing before production deployment:

- **Production**: Stable releases for all users (`updates.flintnote.com`)
- **Canary**: Early testing releases for new features (`canary.flintnote.com`)

## Implementation Details

### 1. Configuration Files

Created two separate Electron Builder configurations:

- **`electron-builder.production.yml`**: Points to `https://updates.flintnote.com`
- **`electron-builder.canary.yml`**: Points to `https://canary.flintnote.com`
  - Product name: "Flint Canary" (distinguishable from production)
  - Executable name: `flint-canary`

### 2. Build Scripts

Added train-specific build commands to `package.json`:

**Production:**

- `npm run build:mac:production`
- `npm run build:win:production`
- `npm run build:linux:production`

**Canary:**

- `npm run build:mac:canary`
- `npm run build:win:canary`
- `npm run build:linux:canary`

### 3. Versioning Strategy

**Production releases** use stable semver:

```bash
npm version 1.0.1
git tag v1.0.1
git push origin v1.0.1
```

**Canary releases** use prerelease tags:

```bash
npm version 1.1.0-canary.1
git tag v1.1.0-canary.1
git push origin v1.1.0-canary.1
```

**Promoting canary to production:**

```bash
# After testing canary 1.1.0-canary.3
npm version 1.1.0
git tag v1.1.0
git push origin v1.1.0
```

### 4. GitHub Actions Automation

Modified `.github/workflows/release.yml` to automatically:

1. **Detect train from tag name**: Presence of `-canary.` in tag indicates canary train
2. **Select appropriate configuration**: Uses `electron-builder.production.yml` or `electron-builder.canary.yml`
3. **Deploy to correct R2 bucket**:
   - Production → `R2_PRODUCTION_BUCKET_NAME`
   - Canary → `R2_CANARY_BUCKET_NAME`
4. **Create GitHub release**: Marks canary releases as prerelease

### 5. Required Infrastructure

**Cloudflare R2 Buckets:**

- `flint-updates-production` with custom domain `updates.flintnote.com`
- `flint-updates-canary` with custom domain `canary.flintnote.com`

**GitHub Secrets:**

- `R2_ACCESS_KEY_ID` - Shared R2 API access key
- `R2_SECRET_ACCESS_KEY` - Shared R2 API secret key
- `R2_PRODUCTION_BUCKET_NAME` - Production bucket name
- `R2_CANARY_BUCKET_NAME` - Canary bucket name
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID

## Usage

### For Developers

**Release to production:**

```bash
npm version 1.0.1
git push origin main v1.0.1
```

**Release to canary:**

```bash
npm version 1.1.0-canary.1
git push origin main v1.1.0-canary.1
```

### For Users

**Production users:**

- Install from `updates.flintnote.com`
- Receive stable updates only

**Canary users:**

- Install from `canary.flintnote.com`
- Receive early access to new features
- Can run side-by-side with production (different executable names)

## Benefits

1. **Safe Testing**: Test new features with canary users before general release
2. **Side-by-Side Installation**: Users can have both production and canary installed
3. **Automated Deployment**: Single workflow handles both trains automatically
4. **Clear Separation**: Different buckets, URLs, and version formats prevent confusion
5. **Easy Promotion**: Canary versions can be promoted to production by removing prerelease tag

## Files Modified

- `electron-builder.production.yml` (created)
- `electron-builder.canary.yml` (created)
- `package.json` (added build scripts)
- `.github/workflows/release.yml` (added train detection and dynamic deployment)
- `docs/AUTO-UPDATER-SETUP.md` (updated with dual-train documentation)

## Next Steps

1. Create the two R2 buckets in Cloudflare
2. Configure custom domains (`updates.flintnote.com` and `canary.flintnote.com`)
3. Add GitHub secrets for both bucket names
4. Test with a canary release first
5. Deploy production release once canary is verified
