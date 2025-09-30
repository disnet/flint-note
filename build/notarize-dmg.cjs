const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizeDmg(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Check for required environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn(
      'Skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID must be set'
    );
    return;
  }

  // Find the DMG file
  const productName = packager.appInfo.productName;
  const version = packager.appInfo.version;
  const dmgName = `${productName}-${version}-universal.dmg`;
  const dmgPath = path.join(packager.outDir, dmgName);

  console.log(`Notarizing DMG: ${dmgPath}`);

  try {
    await notarize({
      tool: 'notarytool',
      appPath: dmgPath,
      appleId,
      appleIdPassword,
      teamId
    });

    console.log(`Successfully notarized: ${dmgPath}`);
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
