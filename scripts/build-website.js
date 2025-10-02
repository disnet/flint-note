#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Get the latest stable (non-canary) version from git tags
function getLatestStableVersion() {
  try {
    const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter((tag) => tag.startsWith('v'));

    // Find first non-canary tag
    const stableTag = tags.find((tag) => !tag.includes('canary'));
    if (stableTag) {
      return stableTag.substring(1); // Remove 'v' prefix
    }
  } catch (error) {
    console.warn('Could not get version from git tags:', error.message);
  }

  // Fallback to package.json version
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  return pkg.version;
}

const version = getLatestStableVersion();

// Read template
const template = readFileSync(join(rootDir, 'website/index.template.html'), 'utf-8');

// Replace all instances of {{VERSION}} with actual version
const html = template.replaceAll('{{VERSION}}', version);

// Add warning comment at the top
const finalHtml = `<!-- This file is auto-generated from index.template.html - DO NOT EDIT DIRECTLY -->\n${html}`;

// Write final HTML
writeFileSync(join(rootDir, 'website/index.html'), finalHtml);

console.log(`✓ Built website with version ${version}`);
