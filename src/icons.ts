// Monochrome vector pictograms — no emoji.
// Each icon is a 16×16 inline SVG, current-color stroke.

const svg = (paths: string, viewBox = "0 0 24 24"): string =>
  `<svg viewBox="${viewBox}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  status: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.2"/>'),
  presence: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9 12h6"/>'),
  media: svg('<circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="15" r="2.6"/><path d="M9.6 17V6.5L19.6 4v11"/>'),
  game: svg('<path d="M6 8h12a4 4 0 0 1 4 4v3a3 3 0 0 1-5.4 1.8L15 15H9l-1.6 1.8A3 3 0 0 1 2 15v-3a4 4 0 0 1 4-4z"/><path d="M7.5 11v3M6 12.5h3"/><circle cx="16" cy="11.6" r="0.6"/><circle cx="18" cy="13.4" r="0.6"/>'),
  image: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9.2" cy="9.2" r="1.7"/><path d="M4.5 17.5l4.6-4.6 3.2 3.2 2.7-2.7 4.5 4.5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>'),
  minimize: svg('<path d="M5 12.5h14" viewBox="0 0 24 24"/>'),
  maximize: svg('<rect x="6" y="6" width="12" height="12" rx="1.5" viewBox="0 0 24 24"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" viewBox="0 0 24 24"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  folder: svg('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2v8.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-.7 4.5"/><path d="M20 5v6h-6"/>'),
  link: svg('<path d="M10 14a4.4 4.4 0 0 0 6.3.3l2.2-2.2a4.2 4.2 0 0 0-6-6l-1.2 1.2"/><path d="M14 10a4.4 4.4 0 0 0-6.3-.3l-2.2 2.2a4.2 4.2 0 0 0 6 6l1.2-1.2"/>'),
  play: svg('<path d="M8.5 6.5v11L18 12z"/>'),
  pause: svg('<path d="M9 6.5v11M15 6.5v11"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  sparkle: svg('<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/>')
};
