# Flint Website Deployment Guide

This document explains how to deploy and maintain the Flint website hosted on Cloudflare Pages.

## Overview

The Flint website is a minimal static splash page hosted on Cloudflare Pages. It provides:

- Product overview and feature highlights
- Download links for all platforms (macOS, Windows, Linux)
- Link to canary builds for early testers
- Minimal, clean design with dark mode support

## Domain Structure

The Flint infrastructure uses the following domain layout:

- **`www.flintnote.com`** - Main marketing website (Cloudflare Pages)
- **`updates.flintnote.com`** - Production update server (R2 bucket: `flint-updates-production`)
- **`canary.flintnote.com`** - Canary update server (R2 bucket: `flint-updates-canary`)

## Website Structure

```
website/
├── index.html          # Main landing page (generated)
├── index.template.html # HTML template with {{VERSION}} placeholders
├── styles.css          # Stylesheet with dark mode support
└── 404.html            # Custom 404 page

scripts/
└── build-website.js    # Build script that generates index.html from template
```

The website is intentionally minimal - just static HTML and CSS with no JavaScript. A simple build step reads the version from `package.json` and generates `index.html` from the template.

## Cloudflare Pages Setup

### Prerequisites

- Cloudflare account with access to Pages
- Domain registered and DNS managed by Cloudflare
- GitHub repository access

### Step 1: Create Pages Project

1. **Log into Cloudflare Dashboard:**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Navigate to Workers & Pages

2. **Create new Pages project:**
   - Click "Create application"
   - Select "Pages" tab
   - Click "Connect to Git"
   - Choose your GitHub repository (`flint-ui`)
   - Click "Begin setup"

3. **Configure build settings:**
   - **Project name:** `flint-website`
   - **Production branch:** `main`
   - **Build command:** _(leave empty - no build needed)_
   - **Build output directory:** `website`
   - Click "Save and Deploy"

### Step 2: Configure Custom Domain

1. **Add custom domain:**
   - In your Pages project, go to "Custom domains" tab
   - Click "Set up a custom domain"
   - Enter `www.flintnote.com`
   - Cloudflare will automatically configure DNS

2. **Verify DNS records:**
   - Go to DNS settings for your domain
   - Confirm CNAME record: `www` → `flint-website.pages.dev`
   - SSL/TLS should be set to "Full (strict)"

### Step 3: Configure GitHub Secrets

The GitHub Actions workflow requires these secrets:

**In GitHub repository settings (`Settings > Secrets and variables > Actions`):**

- `CLOUDFLARE_API_TOKEN` - API token with Pages permissions
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

**Getting API Token:**

1. Go to Cloudflare Dashboard → My Profile → API Tokens
2. Click "Create Token"
3. Use "Edit Cloudflare Workers" template or create custom token with:
   - Permissions: `Cloudflare Pages — Edit`
   - Account Resources: Your account
4. Copy token and add to GitHub secrets

**Getting Account ID:**

1. Go to Cloudflare Dashboard → Workers & Pages
2. Account ID is shown in the sidebar or URL
3. Add to GitHub secrets

## Automatic Deployment

The website automatically deploys on every push to `main` that modifies files in the `website/` directory.

**Deployment workflow:**

1. Push changes to `website/` directory or `package.json` version
2. GitHub Actions workflow (`.github/workflows/deploy-website.yml`) triggers
3. Build script runs: `npm run build:website`
   - Reads version from `package.json`
   - Generates `website/index.html` from `website/index.template.html`
   - Replaces all `{{VERSION}}` placeholders with actual version number
4. Cloudflare Pages deploys the generated website
5. Changes are live at `www.flintnote.com` within ~1 minute

**Manual deployment:**

You can also trigger deployment manually:

1. Go to GitHub repository → Actions
2. Select "Deploy Website to Cloudflare Pages"
3. Click "Run workflow"

## Local Development

**Build the website locally:**

```bash
# Generate index.html from template with current version
npm run build:website
```

This reads the version from `package.json` and generates `website/index.html` from the template.

**Preview locally:**

Since this is a static website, you can preview it with any HTTP server:

**Using Python:**

```bash
# First build the website
npm run build:website

# Then serve it
cd website
python3 -m http.server 8000
# Visit http://localhost:8000
```

**Using Node.js:**

```bash
npm run build:website
npx serve website
# Visit http://localhost:3000
```

**Using VS Code:**

1. Run `npm run build:website`
2. Install the "Live Server" extension
3. Right-click `website/index.html` → "Open with Live Server"

## Updating Version and Download Links

Download links are **automatically updated** when you change the version in `package.json`.

**When you release a new version:**

1. **Update version in package.json:**
   ```bash
   npm version 0.2.4  # or npm version patch/minor/major
   ```

2. **Build and commit:**
   ```bash
   npm run build:website
   git add package.json website/index.html
   git commit -m "Release v0.2.4"
   git push origin main
   ```

The website automatically deploys with updated download links pointing to the new version.

**How it works:**

- Version number and download URLs use `{{VERSION}}` placeholders in `website/index.template.html`
- Build script (`npm run build:website`) reads version from `package.json`
- Generates `website/index.html` with all placeholders replaced
- GitHub Actions runs the build script before deploying

**Manual updates:**

If you need to change the template (e.g., update feature descriptions), edit `website/index.template.html` directly, not `index.html`. The `index.html` file is generated and should not be edited manually.

## Canary Builds

The website includes direct download links to the latest canary builds:

- **macOS**: `https://canary.flintnote.com/flint-canary-latest-universal.dmg`
- **Windows**: `https://canary.flintnote.com/flint-canary-latest.exe`
- **Linux**: `https://canary.flintnote.com/flint-canary-latest.AppImage`

**How it works:**

The release workflow (`.github/workflows/release.yml`) automatically creates these "latest" copies when deploying canary builds:

1. Builds the canary release with version (e.g., `Flint-1.0.0-canary.1-universal.dmg`)
2. Uploads versioned files to R2 bucket
3. Creates copies with "latest" filenames:
   - `Flint-1.0.0-canary.1-universal.dmg` → `flint-canary-latest-universal.dmg`
   - `Flint Setup 1.0.0-canary.1.exe` → `flint-canary-latest.exe`
   - `Flint-1.0.0-canary.1.AppImage` → `flint-canary-latest.AppImage`

This provides stable URLs that always point to the latest canary build, with no JavaScript or CORS configuration required.

## Customization

### Styling

All styles are in `website/styles.css` with support for:

- **Dark mode:** Automatically detects `prefers-color-scheme`
- **Responsive design:** Mobile-first with breakpoints at 768px and 480px
- **CSS variables:** Easy theming via custom properties

### Content

To update content:

1. Edit `website/index.html` directly
2. Commit and push changes
3. GitHub Actions deploys automatically

## DNS Configuration

If setting up from scratch, configure these DNS records in Cloudflare:

**A Records (if using apex domain):**
```
Type    Name    Content
A       @       [Cloudflare Pages IP]
```

**CNAME Records:**
```
Type     Name      Target
CNAME    www       flint-website.pages.dev
CNAME    updates   flint-updates-production.{account-id}.r2.cloudflarestorage.com
CNAME    canary    flint-updates-canary.{account-id}.r2.cloudflarestorage.com
```

Note: For R2 custom domains, you may need to use Cloudflare's R2 custom domain feature instead of direct CNAME records. See `AUTO-UPDATER-SETUP.md` for R2 domain configuration.

## Monitoring and Analytics

Cloudflare Pages provides built-in analytics:

1. Go to your Pages project dashboard
2. Click "Analytics" tab
3. View:
   - Visitor traffic
   - Geographic distribution
   - Page views and unique visitors
   - Cache hit rates

For more detailed analytics, consider adding:

- Cloudflare Web Analytics (privacy-friendly, no JavaScript required)
- Google Analytics (if detailed user tracking is needed)

## Troubleshooting

### Deployment Failures

**Issue:** GitHub Actions workflow fails

**Solutions:**
- Verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set correctly
- Check API token has correct permissions (Cloudflare Pages — Edit)
- Ensure token hasn't expired

### Custom Domain Not Working

**Issue:** `www.flintnote.com` shows 404 or SSL error

**Solutions:**
- Verify DNS CNAME record points to `flint-website.pages.dev`
- Check SSL/TLS mode is set to "Full (strict)"
- Wait 5-10 minutes for DNS propagation
- Clear browser cache and try incognito mode

### Download Links Broken

**Issue:** Download buttons return 404

**Solutions:**
- Verify files are uploaded to R2 bucket (`flint-updates-production`)
- Check R2 bucket has public access enabled
- Ensure file names in HTML match exactly (case-sensitive)
- Test direct R2 URLs in browser

### Styling Issues

**Issue:** Website looks broken or unstyled

**Solutions:**
- Ensure `styles.css` is in same directory as `index.html`
- Check browser console for 404 errors
- Verify Cloudflare Pages deployed all files (check deployment log)
- Clear browser cache

## Cost

Cloudflare Pages is completely free for:

- Unlimited requests
- Unlimited bandwidth
- 500 builds per month
- Custom domains

This makes it perfect for hosting the Flint website with zero ongoing costs.

## Security

**Best Practices:**

- Always use HTTPS (automatic with Cloudflare Pages)
- Keep API tokens secure in GitHub secrets
- Limit API token permissions to only Pages
- Review deployment logs for any suspicious activity

## Maintenance

**Regular tasks:**

1. **Update download links** when releasing new versions
2. **Monitor analytics** to understand user traffic
3. **Review deployment logs** for any errors
4. **Test website** after major changes on multiple devices

**Occasional tasks:**

1. **Rotate API tokens** every 6-12 months
2. **Update dependencies** (if adding any in future)
3. **Review analytics** to optimize content
4. **Check DNS records** remain correctly configured

## Future Enhancements

Potential improvements to consider:

- Add a "Getting Started" guide page
- Include screenshots or demo video
- Add GitHub star/fork badges
- Create documentation section
- Add release notes page
- Implement basic SEO optimization
- Add social media preview cards (Open Graph)

## Related Documentation

- `AUTO-UPDATER-SETUP.md` - R2 bucket configuration for update servers
- `ARCHITECTURE.md` - Electron application architecture
- `DESIGN.md` - UI design documentation
