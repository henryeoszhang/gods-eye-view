/**
 * Whether third-party provider iframes can be embedded in this document.
 *
 * The Pinokio desktop shell externalizes HTTPS iframe navigation — including
 * hidden preloads — so an embedded player there opens a system browser window
 * instead of playing in place. Features that would embed a provider check this
 * first and fall back to a link or a still. A browser visiting the same
 * Pinokio-launched server is an ordinary browser and keeps embeds.
 *
 * @param {object} [globalRef] - Injectable global for tests.
 * @returns {boolean}
 */
export function supportsProviderEmbeds(globalRef = globalThis) {
  return !/(?:^|\s)Pinokio\/[^\s]+/i.test(
    globalRef?.navigator?.userAgent || '',
  );
}
