const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizeDmg(buildResult) {
  const { platformToTargets, outDir } = buildResult;

  // Only notarize macOS builds
  if (!platformToTargets.has('darwin')) {
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

  // Find all DMG files in the output directory
  const fs = require('fs');
  const files = fs.readdirSync(outDir);
  const dmgFiles = files.filter((file) => file.endsWith('.dmg'));

  if (dmgFiles.length === 0) {
    console.warn('No DMG files found to notarize');
    return;
  }

  console.log(`Found ${dmgFiles.length} DMG file(s) to notarize`);

  // Notarize each DMG file
  for (const dmgFile of dmgFiles) {
    const dmgPath = path.join(outDir, dmgFile);
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
      console.error(`Notarization failed for ${dmgFile}:`, error);
      throw error;
    }
  }
};
