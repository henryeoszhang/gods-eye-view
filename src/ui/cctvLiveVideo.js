import { supportsProviderEmbeds } from '../data/embedSupport.js';

/** Privacy-preserving host: youtube-nocookie defers cookies until playback. */
const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const WATCH_URL = (id) => `https://www.youtube.com/watch?v=${id}`;

/** Muted autoplay is the only autoplay a browser will honour unprompted, and
 * these are silent flood cameras anyway. */
const EMBED_URL = (id) =>
  `${EMBED_ORIGIN}/embed/${id}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;

/** Tear down the player, if one is mounted. */
export function _clearCctvLiveVideo() {
  this._cctvLiveVideoId = '';
  if (this._cctvLiveEmbed) {
    this._cctvLiveEmbed.replaceChildren();
    this._cctvLiveEmbed.hidden = true;
  }
  this._cctvFrameWrap?.classList.remove('live-playing');
  if (this._cctvLiveBtn)
    this._cctvLiveBtn.setAttribute('aria-pressed', 'false');
}

/** Mount the player for `videoId`, replacing any camera playing before it. */
function mountPlayer(shell, videoId) {
  if (!shell._cctvLiveEmbed) return;
  if (shell._cctvLiveVideoId === videoId) return;
  const frame = document.createElement('iframe');
  frame.src = EMBED_URL(videoId);
  frame.title = 'Live camera stream';
  frame.allow = 'autoplay; encrypted-media; picture-in-picture';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('loading', 'lazy');
  shell._cctvLiveEmbed.replaceChildren(frame);
  shell._cctvLiveEmbed.hidden = false;
  shell._cctvLiveVideoId = videoId;
  shell._cctvFrameWrap?.classList.add('live-playing');
  shell._cctvLiveBtn?.setAttribute('aria-pressed', 'true');
}

/**
 * Point the live controls at the active camera.
 *
 * The link is offered whenever the camera has a stream, because it works in
 * every shell. The inline player is offered only where provider embeds survive
 * — inside the Pinokio window they do not, and the button would mount a frame
 * the shell immediately externalizes.
 *
 * @param {?object} activeCamera - Public camera state, or null.
 * @param {boolean} enabled - Whether the CCTV layer is on.
 */
export function _syncCctvLiveVideo(activeCamera, enabled) {
  if (this.destroyed) return;
  const videoId = (enabled && activeCamera?.liveVideoId) || '';
  const embeddable = supportsProviderEmbeds();

  if (this._cctvLiveLink) {
    this._cctvLiveLink.hidden = !videoId;
    if (videoId) {
      this._cctvLiveLink.href = WATCH_URL(videoId);
      this._cctvLiveLink.setAttribute(
        'aria-label',
        `Open the live stream for ${activeCamera?.name || 'this camera'} in a new tab`,
      );
    } else {
      this._cctvLiveLink.removeAttribute('href');
    }
  }

  if (this._cctvLiveBtn) {
    this._cctvLiveBtn.hidden = !videoId || !embeddable;
    this._cctvLiveBtn.title = embeddable
      ? 'Play the operator’s live stream in this panel'
      : '';
  }

  // The selected camera changed (or the layer went off): never leave the
  // previous camera's stream playing under new metadata.
  if (!videoId || videoId !== this._cctvLiveVideoId) this._clearCctvLiveVideo();
}

/** Toggle the inline player for the active camera. */
export function _toggleCctvLiveVideo(activeCamera) {
  if (this.destroyed || !supportsProviderEmbeds()) return;
  const videoId = activeCamera?.liveVideoId || '';
  if (!videoId) return;
  if (this._cctvLiveVideoId === videoId) this._clearCctvLiveVideo();
  else mountPlayer(this, videoId);
}
