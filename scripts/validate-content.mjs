#!/usr/bin/env node
/**
 * Content validator for Odyssey Myth Atlas
 * Ensures sources are present and schema is consistent.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../data/src');

const errors = [];
const warnings = [];

function load(name) {
  const p = join(SRC, name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function requireSources(item, label) {
  if (!item.sources || !Array.isArray(item.sources) || item.sources.length === 0) {
    errors.push(`${label}: missing or empty sources`);
  }
}

const config = load('config.json');
const places = load('places.json');
const routes = load('routes.json');
const books = load('books.json');
const beats = load('beats.json');
const characters = load('characters.json');
const factions = load('factions.json');
const themes = load('themes.json');
const mythology = load('mythology.json');
const film = load('film.json');

const placeIds = new Set(places.map((p) => p.id));
const bookNums = new Set(books.map((b) => b.book));

// Books: 24 volumes, sources required
if (books.length !== 24) {
  errors.push(`books: expected 24 entries, got ${books.length}`);
}
books.forEach((b) => {
  requireSources(b, `book ${b.book}`);
  if (b.book < 1 || b.book > 24) errors.push(`book ${b.book}: invalid book number`);
});

// Beats: sources required, valid book refs
beats.forEach((beat) => {
  requireSources(beat, `beat ${beat.id}`);
  if (!bookNums.has(beat.book)) errors.push(`beat ${beat.id}: unknown book ${beat.book}`);
  if (beat.placeId && !placeIds.has(beat.placeId)) {
    warnings.push(`beat ${beat.id}: unknown placeId ${beat.placeId}`);
  }
});

// Sequence continuity
const sequences = beats.map((b) => b.sequence).sort((a, b) => a - b);
for (let i = 1; i < sequences.length; i++) {
  if (sequences[i] === sequences[i - 1]) {
    warnings.push(`duplicate sequence ${sequences[i]}`);
  }
}

// Mythology sections
mythology.sections.forEach((s, i) => {
  requireSources(s, `mythology section ${i}`);
});

// Film
requireSources(film, 'film');

// Places: confidence enum
const validConf = new Set(['consensus', 'disputed', 'legendary']);
places.forEach((p) => {
  if (!validConf.has(p.confidence)) errors.push(`place ${p.id}: invalid confidence`);
});

// Config tour
if (!config.tour || config.tour.length < 3) {
  warnings.push('config.tour: fewer than 3 steps');
}

// Characters book refs
characters.forEach((c) => {
  c.books?.forEach((bn) => {
    if (!bookNums.has(bn)) warnings.push(`character ${c.id}: unknown book ${bn}`);
  });
});

console.log('=== Odyssey Content Validation ===');
console.log(`Books: ${books.length}, Beats: ${beats.length}, Places: ${places.length}`);
console.log(`Characters: ${characters.length}, Factions: ${factions.length}`);

if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach((w) => console.log('  ⚠', w));
}

if (errors.length) {
  console.log('\nErrors:');
  errors.forEach((e) => console.log('  ✗', e));
  process.exit(1);
}

console.log('\n✓ Validation passed');
process.exit(0);
