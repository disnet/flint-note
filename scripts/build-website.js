#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
const version = pkg.version;

// Read template
const template = readFileSync(join(rootDir, 'website/index.template.html'), 'utf-8');

// Replace all instances of {{VERSION}} with actual version
const html = template.replaceAll('{{VERSION}}', version);

// Add warning comment at the top
const finalHtml = `<!-- This file is auto-generated from index.template.html - DO NOT EDIT DIRECTLY -->\n${html}`;

// Write final HTML
writeFileSync(join(rootDir, 'website/index.html'), finalHtml);

console.log(`✓ Built website with version ${version}`);
