#!/usr/bin/env node
/**
 * Verify referenced media files exist and are non-empty.
 * Exits non-zero on missing assets so the site cannot ship broken images silently.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'data/src');
const errors = [];
const seen = new Set();

function check(rel, label) {
  if (!rel || /^https?:\/\//.test(rel)) return;
  const clean = rel.split('?')[0];
  if (seen.has(clean)) return;
  seen.add(clean);
  const fp = join(root, clean);
  if (!existsSync(fp)) {
    errors.push(`${label}: missing ${clean}`);
    return;
  }
  if (statSync(fp).size < 100) errors.push(`${label}: too small ${clean}`);
}

const media = JSON.parse(readFileSync(join(src, 'media.json'), 'utf8'));
const film = JSON.parse(readFileSync(join(src, 'film.json'), 'utf8'));
const characters = JSON.parse(readFileSync(join(src, 'characters.json'), 'utf8'));

Object.entries(media.places || {}).forEach(([id, p]) => {
  check(p.hero, `place ${id} hero`);
  (p.gallery || []).forEach((g, i) => check(g.src, `place ${id} gallery[${i}]`));
});
Object.entries(media.characters || {}).forEach(([id, c]) => check(c.portrait, `media char ${id}`));
Object.entries(media.books || {}).forEach(([id, b]) => check(b.hero, `book ${id} hero`));
(media.gallery || []).forEach((g, i) => check(g.src, `gallery[${i}]`));
(media.videos || []).forEach((v) => check(v.poster, `video ${v.id} poster`));

(film.cast || []).forEach((c) => check(c.portrait, `film cast ${c.actor}`));
(film.stills || []).forEach((s, i) => check(s.src, `film still[${i}]`));
characters.forEach((c) => check(c.filmPortrait, `character ${c.id} filmPortrait`));

['assets/images/mediterranean-cinema-bg.jpg', 'assets/images/ship-hero-cinema.jpg', 'assets/favicon.svg'].forEach((p) =>
  check(p, 'core')
);

if (errors.length) {
  console.error('Image validation FAILED:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log(`Image validation OK (${seen.size} local assets checked)`);
