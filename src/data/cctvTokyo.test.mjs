import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseTokyoSuiboCatalog,
  isLikelyTokyoCoordinate,
  tokyoLiveVideoId,
} from '../../server/providers/cctv/sources.js';
import { supportsProviderEmbeds } from './embedSupport.js';
import {
  resolveTokyoSuiboFrameUrl,
  tokyoSuiboFrameExpiry,
} from '../../server/providers/cctv/media.js';
import { normalizeSourceItem } from '../../server/providers/cctv/normalize.js';

/** A minimal stand-in for the flood-information map page's inline arrays.
 * Row 0 is a camera, row 1 a water-level gauge, row 2 an Ogasawara camera. */
function catalogPage({
  kbn = ['07', '02', '07'],
  cd = ['7B08', '2F08', '7Q01'],
} = {}) {
  const arr = (values) => `[${values.map((v) => `'${v}'`).join(',')}]`;
  return `
    var arrryKansokujoCd = ${arr(cd)};
    var arrryKansokujoNm = ${arr(['鎌田橋野川', '内匠橋', '八ッ瀬川'])};
    var arrryKansokujoKbn = ${arr(kbn)};
    var arrryTougouCd = ${arr(['304009', '105002', '515001'])};
    var arrryVideoPageAddress = ${arr(['https://www.youtube.com/watch?v=fk37cmRWx3c&list=PLx', 'null', 'https://youtube.com/live/n1TtSZ7z7c0'])};
    var arrayIdoFun = ${arr(['35', '35', '27'])};
    var arrryIdoFun = ${arr(['37', '47', '3'])};
    var arrryIdoByo = ${arr(['15.75', '31.46', '33.34'])};
    var arrryKeidoDo = ${arr(['139', '139', '142'])};
    var arrryKeidoFun = ${arr(['36', '49', '12'])};
    var arrryKeidoByo = ${arr(['41.24', '41.16', '9.07'])};
  `;
}

test('registers only 映像監視局 rows, not gauges', () => {
  const cameras = parseTokyoSuiboCatalog(catalogPage());
  assert.deepEqual(
    cameras.map((c) => c.id),
    ['tokyo-suibo-7b08', 'tokyo-suibo-7q01'],
  );
});

test('converts the page DMS arrays to decimal degrees', () => {
  const [kamata] = parseTokyoSuiboCatalog(catalogPage());
  assert.ok(Math.abs(kamata.lat - 35.621042) < 0.0001, kamata.lat);
  assert.ok(Math.abs(kamata.lon - 139.611456) < 0.0001, kamata.lon);
});

test('keeps the Ogasawara camera, 1,000 km south of the mainland', () => {
  const ogasawara = parseTokyoSuiboCatalog(catalogPage()).at(-1);
  assert.equal(ogasawara.name, '八ッ瀬川');
  assert.ok(isLikelyTokyoCoordinate(ogasawara.lat, ogasawara.lon));
  assert.ok(ogasawara.lat < 28, 'Chichijima, not the mainland');
});

test('rejects coordinates outside the prefecture', () => {
  assert.equal(isLikelyTokyoCoordinate(51.05, -114.06), false);
  assert.equal(isLikelyTokyoCoordinate(null, 139.7), false);
});

test('publishes nothing when the page arrays fall out of step', () => {
  const skewed = catalogPage().replace(
    "var arrryKansokujoNm = ['鎌田橋野川','内匠橋','八ッ瀬川'];",
    "var arrryKansokujoNm = ['鎌田橋野川','内匠橋'];",
  );
  assert.deepEqual(parseTokyoSuiboCatalog(skewed), []);
});

test('publishes nothing for an unrecognisable page', () => {
  assert.deepEqual(parseTokyoSuiboCatalog('<html>maintenance</html>'), []);
  assert.deepEqual(parseTokyoSuiboCatalog(''), []);
});

test('carries the station code the frame resolver needs', () => {
  const [kamata] = parseTokyoSuiboCatalog(catalogPage());
  assert.equal(kamata.stationCode, '304009');
  assert.equal(kamata.feedType, 'image');
  assert.equal(kamata.sourceKind, 'tokyo-suibo');
  // Normalization drops unknown fields, so the station code has to survive it.
  assert.equal(normalizeSourceItem(kamata).stationCode, '304009');
});

test('headings are marked low confidence: the bureau publishes no facing', () => {
  for (const camera of parseTokyoSuiboCatalog(catalogPage())) {
    assert.equal(camera.headingConfidence, 'low');
    assert.ok(Number.isFinite(camera.headingDeg));
  }
});

// --- frame resolution -----------------------------------------------------

const STATION_URL =
  'https://www.kasen-suibo.metro.tokyo.lg.jp/im/uryosuii/tsim0105g_304009.html';

test('resolves the newest frame relative to the station page', () => {
  const html = 'IMAGE[0] = "../../img/itv/7B08/7B0820260919163000.jpeg"; IMAGE[1] = "x";';
  assert.equal(
    resolveTokyoSuiboFrameUrl(html, STATION_URL),
    'https://www.kasen-suibo.metro.tokyo.lg.jp/img/itv/7B08/7B0820260919163000.jpeg',
  );
});

test('refuses a frame that resolves off the image host', () => {
  const html = 'IMAGE[0] = "https://evil.example/steal.jpeg";';
  assert.equal(resolveTokyoSuiboFrameUrl(html, STATION_URL), null);
  const traversal = 'IMAGE[0] = "../../../../etc/passwd";';
  assert.equal(resolveTokyoSuiboFrameUrl(traversal, STATION_URL), null);
});

test('returns null when the page carries no frame', () => {
  assert.equal(resolveTokyoSuiboFrameUrl('<html></html>', STATION_URL), null);
});

test('holds a resolved frame until the next capture is due', () => {
  const captured = Date.parse('2026-09-19T16:30:00+09:00');
  const url = 'https://www.kasen-suibo.metro.tokyo.lg.jp/img/itv/7B08/7B0820260919163000.jpeg';
  const expiry = tokyoSuiboFrameExpiry(url, captured + 1000);
  assert.ok(expiry > captured + 5 * 60 * 1000, 'past the next capture');
  assert.ok(expiry <= captured + 1000 + 5 * 60 * 1000, 'never more than one interval out');
});

test('a stale or unparseable capture time still bounds the memo', () => {
  const now = Date.parse('2026-09-19T16:30:00+09:00');
  const ancient = 'https://www.kasen-suibo.metro.tokyo.lg.jp/img/itv/7B08/7B0819990101000000.jpeg';
  assert.ok(tokyoSuiboFrameExpiry(ancient, now) >= now + 30_000);
  const junk = 'https://www.kasen-suibo.metro.tokyo.lg.jp/img/itv/7B08/nope.jpeg';
  assert.equal(tokyoSuiboFrameExpiry(junk, now), now + 5 * 60 * 1000);
});

// --- live video -----------------------------------------------------------

test('reads the three link shapes the bureau publishes', () => {
  assert.equal(tokyoLiveVideoId('https://www.youtube.com/watch?v=fk37cmRWx3c'), 'fk37cmRWx3c');
  assert.equal(tokyoLiveVideoId('https://youtu.be/8p11ESAA15w'), '8p11ESAA15w');
  assert.equal(tokyoLiveVideoId('https://youtube.com/live/MOYui7vUqsE?feature=share'), 'MOYui7vUqsE');
  // A playlist tail must not be mistaken for the video.
  assert.equal(
    tokyoLiveVideoId('https://www.youtube.com/watch?v=fk37cmRWx3c&list=PLgqzusg'),
    'fk37cmRWx3c',
  );
});

test('refuses anything that is not a YouTube video id', () => {
  for (const value of ['', 'null', 'not a url', 'https://evil.example/watch?v=abcdefghijk',
    'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/'])
    assert.equal(tokyoLiveVideoId(value), null, value);
});

test('carries the live video id only for cameras that have one', () => {
  const [kamata, ogasawara] = parseTokyoSuiboCatalog(catalogPage());
  assert.equal(kamata.liveVideoId, 'fk37cmRWx3c');
  assert.equal(ogasawara.liveVideoId, 'n1TtSZ7z7c0');
  assert.equal(normalizeSourceItem(kamata).liveVideoId, 'fk37cmRWx3c');
  // A malformed id must not reach the panel as an embed target.
  assert.equal(normalizeSourceItem({ ...kamata, liveVideoId: 'nope' }).liveVideoId, '');
});

test('provider embeds are off inside the Pinokio shell and on in a browser', () => {
  const ua = (userAgent) => ({ navigator: { userAgent } });
  assert.equal(supportsProviderEmbeds(ua('Mozilla/5.0 Chrome/140.0 Safari/537.36')), true);
  assert.equal(
    supportsProviderEmbeds(ua('Mozilla/5.0 Electron/32 Pinokio/8.2.0 Safari/537.36')),
    false,
  );
  assert.equal(supportsProviderEmbeds({}), true);
});
