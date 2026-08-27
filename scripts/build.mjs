#!/usr/bin/env node
/**
 * Build pipeline: merge data, hash assets, update index.html
 */
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const srcDir = join(root, 'data/src');
const assetsDir = join(root, 'assets');
const indexPath = join(root, 'index.html');

mkdirSync(assetsDir, { recursive: true });

// Validate first
console.log('Running content validation...');
execSync('node scripts/validate-content.mjs', { cwd: root, stdio: 'inherit' });

const files = [
  'config',
  'places',
  'routes',
  'books',
  'beats',
  'characters',
  'factions',
  'themes',
  'mythology',
  'film',
];

const data = {};
for (const key of files) {
  const p = join(srcDir, `${key}.json`);
  data[key === 'config' ? 'config' : key] = JSON.parse(readFileSync(p, 'utf8'));
}

const dataStr = JSON.stringify(data);
const dataHash = createHash('sha256').update(dataStr).digest('hex').slice(0, 10);
const dataFile = `data-${dataHash}.json`;
writeFileSync(join(assetsDir, dataFile), dataStr);

const appSrc = join(assetsDir, 'app-source.js');
const appBuf = readFileSync(appSrc);
const appHash = createHash('sha256').update(appBuf).digest('hex').slice(0, 10);
const appFile = `app-${appHash}.js`;
writeFileSync(join(assetsDir, appFile), appBuf);

const split = {
  data: `assets/${dataFile}`,
  app: `assets/${appFile}`,
};

let html = readFileSync(indexPath, 'utf8');
const splitJson = JSON.stringify(split);
html = html.replace(
  /window\.__SPLIT__\s*=\s*\{[^}]*\};/,
  `window.__SPLIT__=${splitJson};`
);
writeFileSync(indexPath, html);

console.log('\nBuild complete:');
console.log(`  data: assets/${dataFile} (${(dataStr.length / 1024).toFixed(1)} KB)`);
console.log(`  app:  assets/${appFile} (${(appBuf.length / 1024).toFixed(1)} KB)`);
