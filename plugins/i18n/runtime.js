// God's Eye View — interface language plugin (English / 日本語 / 简体中文).
//
// The upstream app carries no i18n layer and ~156k lines of source, so this
// translates the rendered DOM instead of rewriting call sites: one dictionary
// per language, keyed by the exact English string the app paints. Anything the
// dictionary does not name stays English, which is also what happens to live
// provider data (place names, aircraft types, station names) by design.
//
// ponytail: dictionary-driven DOM swap, not message-key extraction. Move to real
// message keys only if upstream ever grows an i18n layer to hook into.
import './picker.css';
import { translate } from './translate.js';

const STORAGE_KEY = 'gev:ui-language';
const LANGUAGES = [
  { tag: 'en', label: 'English' },
  { tag: 'ja', label: '日本語' },
  { tag: 'zh-CN', label: '简体中文' },
];
const TRANSLATED_ATTRIBUTES = ['title', 'aria-label', 'aria-valuetext', 'placeholder', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'TEMPLATE']);
// The intelligence HUD is a simulated imagery-intel readout: MGRS, NIIRS, GSD
// and the classification banner are standing notations, so it stays verbatim.
const SKIP_IDS = new Set(['intel-hud']);

// Written text keyed by node, so an app repaint is told apart from our own.
const sources = new WeakMap(); // Node -> English source (text nodes)
const written = new WeakMap(); // Node -> what we last wrote (text nodes)
const attrSources = new WeakMap(); // Element -> Map<attr, English source>
const attrWritten = new WeakMap(); // Element -> Map<attr, what we last wrote>

let pack = null;

/** Material Symbols render by ligature: their text is a glyph name, never prose. */
function isSkipped(element) {
  if (SKIP_TAGS.has(element.tagName)) return true;
  if (element.hasAttribute('data-gev-i18n-skip')) return true;
  if (SKIP_IDS.has(element.id)) return true;
  const className = element.getAttribute('class');
  return typeof className === 'string' && className.includes('material-symbols');
}

function mapFor(store, element) {
  let map = store.get(element);
  if (!map) {
    map = new Map();
    store.set(element, map);
  }
  return map;
}

function applyText(node) {
  const current = node.data;
  // A value we did not write is the app repainting: adopt it as the new source.
  const source = written.get(node) === current ? sources.get(node) : current;
  sources.set(node, source);
  const next = translate(pack, source);
  written.set(node, next);
  if (next !== current) node.data = next;
}

function applyAttribute(element, attribute) {
  const current = element.getAttribute(attribute);
  if (current === null) return;
  const seen = mapFor(attrWritten, element);
  const kept = mapFor(attrSources, element);
  const source = seen.get(attribute) === current ? kept.get(attribute) : current;
  kept.set(attribute, source);
  const next = translate(pack, source);
  seen.set(attribute, next);
  if (next !== current) element.setAttribute(attribute, next);
}

function applyElement(element) {
  for (const attribute of TRANSLATED_ATTRIBUTES) applyAttribute(element, attribute);
}

/** Translate `root` and everything under it, skipping icon and non-prose subtrees. */
function applyTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.data.trim()) applyText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || isSkipped(root)) return;
  applyElement(root);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE)
          return isSkipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return node.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    },
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) applyElement(node);
    else applyText(node);
  }
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === 'characterData') {
      const node = record.target;
      if (node.parentElement && !isSkipped(node.parentElement) && node.data.trim())
        applyText(node);
    } else if (record.type === 'attributes') {
      if (!isSkipped(record.target)) applyAttribute(record.target, record.attributeName);
    } else {
      for (const node of record.addedNodes) applyTree(node);
    }
  }
});

function startObserving() {
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATED_ATTRIBUTES,
  });
}

const PACK_LOADERS = {
  ja: () => import('./dictionaries/ja.js'),
  'zh-CN': () => import('./dictionaries/zh-CN.js'),
};

async function setLanguage(tag) {
  const known = LANGUAGES.some((language) => language.tag === tag) ? tag : 'en';
  const load = PACK_LOADERS[known];
  pack = load ? (await load()).default : null;
  document.documentElement.lang = known;
  applyTree(document.body);
  try {
    localStorage.setItem(STORAGE_KEY, known);
  } catch {
    // Private windows and blocked site data: the choice just will not persist.
  }
}

/** Stored choice first, then the browser's own preference order, then English. */
function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((language) => language.tag === stored)) return stored;
  } catch {
    // Fall through to browser preference.
  }
  for (const preferred of navigator.languages ?? [navigator.language ?? '']) {
    const lower = String(preferred).toLowerCase();
    if (lower.startsWith('ja')) return 'ja';
    // Traditional-script locales are not translated, so they stay English.
    if (lower === 'zh' || lower.startsWith('zh-cn') || lower.startsWith('zh-hans'))
      return 'zh-CN';
  }
  return 'en';
}

function mountPicker(current) {
  const select = document.createElement('select');
  select.id = 'gev-i18n-picker';
  select.className = 'gev-i18n-picker';
  select.setAttribute('data-gev-i18n-skip', '');
  select.setAttribute('aria-label', 'Interface language / 表示言語 / 界面语言');
  select.title = 'Interface language';
  for (const { tag, label } of LANGUAGES) {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = label;
    if (tag === current) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => setLanguage(select.value));
  (document.querySelector('#top-center-actions') ?? document.body).append(select);
}

const language = initialLanguage();
mountPicker(language);
startObserving();
setLanguage(language);
