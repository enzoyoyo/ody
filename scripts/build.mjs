#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const srcDir = join(root, 'data/src');
const assetsDir = join(root, 'assets');
const jsDir = join(assetsDir, 'js');
const cssDir = join(assetsDir, 'css');
const indexPath = join(root, 'index.html');

mkdirSync(assetsDir, { recursive: true });
execSync('node scripts/validate-content.mjs', { cwd: root, stdio: 'inherit' });

const files = ['config', 'places', 'routes', 'books', 'beats', 'characters', 'factions', 'themes', 'mythology', 'film', 'media'];
const data = {};
for (const key of files) {
  const p = join(srcDir, `${key}.json`);
  data[key === 'config' ? 'config' : key] = JSON.parse(readFileSync(p, 'utf8'));
}
const dataStr = JSON.stringify(data);
const dataHash = createHash('sha256').update(dataStr).digest('hex').slice(0, 10);
const dataFile = `data-${dataHash}.json`;
writeFileSync(join(assetsDir, dataFile), dataStr);

const jsFiles = readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
const appSource = jsFiles.map((f) => readFileSync(join(jsDir, f), 'utf8')).join('\n;\n');
writeFileSync(join(assetsDir, 'app-source.js'), appSource);

const appBuf = Buffer.from(appSource);
const appHash = createHash('sha256').update(appBuf).digest('hex').slice(0, 10);
const appFile = `app-${appHash}.js`;
writeFileSync(join(assetsDir, appFile), appBuf);

const cssSrc = readFileSync(join(cssDir, 'ody.css'), 'utf8');
const cssHash = createHash('sha256').update(cssSrc).digest('hex').slice(0, 10);
const cssFile = `ody-${cssHash}.css`;
writeFileSync(join(cssDir, cssFile), cssSrc);

const SITE_VERSION = createHash('sha256').update(appBuf).update(dataStr).update(cssSrc).digest('hex').slice(0, 8);
const bust = `?v=${SITE_VERSION}`;

const split = {
  data: `assets/${dataFile}${bust}`,
  app: `assets/${appFile}${bust}`,
  css: `assets/css/${cssFile}${bust}`,
  version: SITE_VERSION,
};

let html = readFileSync(indexPath, 'utf8');
html = html.replace(
  /href="assets\/css\/ody[^"]*\.css[^"]*"/,
  `href="assets/css/${cssFile}${bust}"`
);
html = html.replace(/window\.__SPLIT__\s*=\s*\{[\s\S]*?\};/, `window.__SPLIT__=${JSON.stringify(split)};`);
writeFileSync(indexPath, html);

console.log('\nBuild complete (v3):');
console.log(`  version: ${SITE_VERSION}`);
console.log(`  css:  assets/css/${cssFile}`);
console.log(`  app:  assets/${appFile} (${(appBuf.length / 1024).toFixed(1)} KB)`);
console.log(`  data: assets/${dataFile} (${(dataStr.length / 1024).toFixed(1)} KB)`);
