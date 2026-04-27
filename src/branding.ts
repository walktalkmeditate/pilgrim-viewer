// Hostname-aware product branding. The same bundle is served at both
// view.pilgrimapp.org (read-only) and edit.pilgrimapp.org (the tend-mode
// editor) — the Cloudflare Worker fronting edit.* rewrites Host so Pages
// returns identical bytes. UI copy that should differ per surface is
// resolved here at runtime.
//
// Static HTML metadata (the <title> and OG/Twitter tags in index.html)
// is rewritten by the Cloudflare Worker via HTMLRewriter so social
// previews honor the same split.

export function isEditHost(): boolean {
  return location.hostname.startsWith('edit.')
}

export function appTitle(): string {
  return isEditHost() ? 'Pilgrim Editor' : 'Pilgrim Viewer'
}

export function appSubtitle(): string {
  return isEditHost()
    ? 'Tend your walks. Your data stays with you.'
    : 'See your walks. Your data stays with you.'
}

export function appTabTitle(): string {
  return isEditHost()
    ? 'Pilgrim Editor — Tend .pilgrim and .gpx walk files'
    : 'Pilgrim Viewer — View .pilgrim and .gpx walk files'
}
