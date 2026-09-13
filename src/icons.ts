// Pictogrammes vectoriels monochromes — aucun emoji.
// Chaque icône est un SVG inline 16×16, stroke courant.

const svg = (paths: string, viewBox = "0 0 24 24"): string =>
  `<svg viewBox="${viewBox}" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const icons = {
  card: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 14h5M8 17h8"/>'),
  music: svg('<circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="15" r="2.6"/><path d="M9.6 17V6.5L19.6 4v11"/>'),
  youtube: svg('<rect x="3" y="6" width="18" height="12" rx="3.5"/><path d="M10.5 9.6v4.8L14.6 12z"/>'),
  custom: svg('<path d="M12 5v14M5 12h14"/>'),
  appearance: svg('<path d="M5 8h14M5 12h9M5 16h5"/><circle cx="17" cy="12" r="2.2"/><circle cx="13" cy="16" r="2.2"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18"/>'),
  eye: svg('<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>'),
  eyeOff: svg('<path d="M4 4l16 16"/><path d="M9.9 5.2A9.8 9.8 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.4 3.2M6.3 7.5A16 16 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 3.5-.65"/>'),
  lock: svg('<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>'),
  unlock: svg('<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2"/>'),
  image: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9.2" cy="9.2" r="1.7"/><path d="M4.5 17.5l4.6-4.6 3.2 3.2 2.7-2.7 4.5 4.5"/>'),
  text: svg('<path d="M5 7h14M9 7v11M14.5 12H19M16.8 12v6"/>'),
  link: svg('<path d="M10 14a4.4 4.4 0 0 0 6.3.3l2.2-2.2a4.2 4.2 0 0 0-6-6l-1.2 1.2"/><path d="M14 10a4.4 4.4 0 0 0-6.3-.3l-2.2 2.2a4.2 4.2 0 0 0 6 6l1.2-1.2"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  gauge: svg('<path d="M5 17a8 8 0 1 1 14 0"/><path d="M12 13.5L15.5 9"/>'),
  calendar: svg('<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v3.4M15.5 3.5v3.4"/>'),
  pin: svg('<path d="M9.5 3.5h5l-.7 6.2 3.2 3.3H7l3.2-3.3z"/><path d="M12 13v7.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  refresh: svg('<path d="M20 11a8 8 0 1 0-.7 4.5"/><path d="M20 5v6h-6"/>'),
  folder: svg('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.3h7a2 2 0 0 1 2 2v8.7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
  power: svg('<path d="M12 3.5v7"/><path d="M6.8 6.8a7.4 7.4 0 1 0 10.4 0"/>'),
  minimize: svg('<path d="M5 12.5h14" viewBox="0 0 24 24"/>'),
  maximize: svg('<rect x="6" y="6" width="12" height="12" rx="1.5" viewBox="0 0 24 24"/>'),
  restore: svg('<rect x="6" y="9" width="9" height="9" rx="1.5"/><path d="M9 6h9v9" viewBox="0 0 24 24"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" viewBox="0 0 24 24"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  external: svg('<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>'),
  play: svg('<path d="M8.5 6.5v11L18 12z"/>'),
  pause: svg('<path d="M9 6.5v11M15 6.5v11"/>')
};
