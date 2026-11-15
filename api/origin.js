// This server's public address, for links in API answers, certificates and embed code.
// PUBLIC_URL wins; on Render, RENDER_EXTERNAL_URL is set for us; otherwise the address the request came to.
export function publicOrigin(req) {
  const set = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  return set || `${req.protocol}://${req.get('host')}`;
}

/** The two lines a provider pastes into their page. */
export function embedCode(req, lessonId, extra = '') {
  return `<script type="module" src="${publicOrigin(req)}/module/db-player.js"></script>\n<db-player lesson="${lessonId}"${extra}></db-player>`;
}
