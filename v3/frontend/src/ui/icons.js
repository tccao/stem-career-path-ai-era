// Minimal inline-SVG set (stroke icons) returned as markup strings for innerHTML templates.
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect>',
  grid: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"></path>',
  chart: '<path d="M3 3v18h18"></path><path d="M7 14l4-4 3 3 5-6"></path>',
  user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>',
  chev: '<path d="M6 9l6 6 6-6"></path>',
  check: '<path d="M20 6L9 17l-5-5"></path>',
  arrow: '<path d="M5 12h14M13 5l7 7-7 7"></path>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>',
};
export function svg(name, cls = '', w = 19) {
  const cl = cls ? ` class="${cls}"` : '';
  return `<svg${cl} viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}
