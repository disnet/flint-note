/**
 * Notarization script for macOS builds
 * This script runs after the app is signed but before it's packaged
 */

async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only run on macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  // Skip notarization in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping notarization in development');
    return;
  }

  // Check for required environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping notarization: Missing required environment variables');
    console.log('Required: APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Starting notarization for ${appPath}...`);

  try {
    // Import @electron/notarize dynamically to avoid module loading issues
    const { notarize } = require('@electron/notarize');

    await notarize({
      appBundleId: 'com.flintnote.flint',
      appPath: appPath,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
      teamId: teamId
    });

    console.log('✅ Notarization completed successfully');
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    // Don't throw the error to prevent build failure
    // In production, you might want to throw to fail the build
    console.log('Continuing build without notarization...');
  }
}

module.exports = notarizeApp;
