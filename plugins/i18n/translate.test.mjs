import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { translate } from './translate.js';
import ja from './dictionaries/ja.js';
import zhCN from './dictionaries/zh-CN.js';

const PACKS = { ja, 'zh-CN': zhCN };

const pack = {
  entries: { CONTACTS: '接触目標', Play: '再生', 'Search any location...': '任意の地点を検索...' },
  patterns: [[/^(.+): (ON|OFF)$/, (name, flag) => `${name}: ${flag === 'ON' ? 'オン' : 'オフ'}`]],
};

test('translates an exact match', () => {
  assert.equal(translate(pack, 'CONTACTS'), '接触目標');
});

test('keeps the whitespace that surrounded the match', () => {
  assert.equal(translate(pack, '\n      CONTACTS\n    '), '\n      接触目標\n    ');
});

test('leaves a miss in English rather than blanking it', () => {
  assert.equal(translate(pack, 'RADIO READY'), 'RADIO READY');
});

test('is case-sensitive, so icon ligatures never match UI words', () => {
  assert.equal(translate(pack, 'play'), 'play');
});

test('passes through when no pack is active', () => {
  assert.equal(translate(null, 'CONTACTS'), 'CONTACTS');
});

test('leaves whitespace-only and empty text alone', () => {
  assert.equal(translate(pack, '   '), '   ');
  assert.equal(translate(pack, ''), '');
});

test('round-trips a string that holds punctuation', () => {
  assert.equal(translate(pack, 'Search any location...'), '任意の地点を検索...');
});

test('falls back to a pattern when the exact lookup misses', () => {
  assert.equal(translate(pack, 'Live Flights: OFF'), 'Live Flights: オフ');
});

test('an exact entry wins over a pattern that would also match', () => {
  const both = { entries: { 'X: ON': '完全一致' }, patterns: pack.patterns };
  assert.equal(translate(both, 'X: ON'), '完全一致');
});

test('a pattern stays stateless across repeated calls', () => {
  for (let i = 0; i < 3; i += 1)
    assert.equal(translate(pack, 'Dams: ON'), 'Dams: オン');
});

// --- language pack integrity ---------------------------------------------

test('every language carries the same keys and patterns', () => {
  const [reference, ...others] = Object.values(PACKS);
  for (const other of others) {
    assert.deepEqual(Object.keys(other.entries).sort(), Object.keys(reference.entries).sort());
    assert.equal(other.patterns.length, reference.patterns.length);
  }
});

test('no key is a Material Symbols ligature, which would erase an icon', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const names = new Set(html.match(/icon_names=([^"&]+)/)[1].split(','));
  assert.ok(names.size > 10, 'icon_names did not parse');
  for (const [language, languagePack] of Object.entries(PACKS))
    for (const key of Object.keys(languagePack.entries))
      assert.ok(!names.has(key), `${language} translates the icon ligature "${key}"`);
});

test('no entry is blank or left untranslated', () => {
  for (const [language, languagePack] of Object.entries(PACKS))
    for (const [key, value] of Object.entries(languagePack.entries)) {
      assert.ok(value.trim(), `${language}: "${key}" is blank`);
      assert.notEqual(value, key, `${language}: "${key}" is still English`);
    }
});

test('no pattern is global, which would make exec stateful', () => {
  for (const [language, languagePack] of Object.entries(PACKS))
    for (const [pattern] of languagePack.patterns)
      assert.ok(!pattern.global, `${language}: ${pattern} is global`);
});

test('each language renders the composed strings the app actually paints', () => {
  const samples = [
    'Live Flights: OFF',
    'CelesTrak · never',
    'POWER UP · 7 KEYS WAITING',
    'Flying to Austin, TX...',
    'paste TOMTOM_API_KEY',
    'Bing Aerial unavailable: Needs CESIUM_ION_TOKEN — add it in Provider Settings',
  ];
  for (const [language, languagePack] of Object.entries(PACKS))
    for (const sample of samples)
      assert.notEqual(translate(languagePack, sample), sample, `${language}: "${sample}" untouched`);
});
