// SVG icon system — single stroke weight, inherits color.
// Usage: import { Icons } from '../components/Icons'  then  <Icons.box size={20} color="#fff" />

const mk = (paths) => ({ size = 20, color = 'currentColor', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" style={style}>{paths}</svg>
)

export const Icons = {
  home: mk(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M9.5 21v-6h5v6" /></>),
  box: mk(<><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>),
  tag: mk(<><path d="M3 7v5l9 9 7-7-9-9H5a2 2 0 0 0-2 2Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>),
  store: mk(<><path d="M4 9V5h16v4" /><path d="M4 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 11v9h14v-9" /></>),
  chat: mk(<><path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12Z" /></>),
  bell: mk(<><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z" /><path d="M10.5 20a2 2 0 0 0 3 0" /></>),
  users: mk(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.6-1.4-4.2-3.5-4.8" /></>),
  grid: mk(<><rect x="3" y="3" width="7" height="7" rx="1.2" /><rect x="14" y="3" width="7" height="7" rx="1.2" /><rect x="3" y="14" width="7" height="7" rx="1.2" /><rect x="14" y="14" width="7" height="7" rx="1.2" /></>),
  scan: mk(<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M3 12h18" /></>),
  chart: mk(<><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" rx="1" /><rect x="12" y="8" width="3" height="10" rx="1" /><rect x="17" y="5" width="3" height="13" rx="1" /></>),
  settings: mk(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>),
  ship: mk(<><path d="M3 14l1.5 5h15L21 14" /><path d="M5 14V8l7-3 7 3v6" /><path d="M12 5v9" /></>),
  plane: mk(<><path d="M21 14 13 9V4a1.5 1.5 0 0 0-3 0v5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-2.5l8 2.5v-2Z" /></>),
  plus: mk(<><path d="M12 5v14M5 12h14" /></>),
  check: mk(<><path d="m5 13 4 4L19 7" /></>),
  x: mk(<><path d="M6 6l12 12M18 6 6 18" /></>),
  chevR: mk(<><path d="m9 6 6 6-6 6" /></>),
  arrowR: mk(<><path d="M5 12h14M13 6l6 6-6 6" /></>),
  back: mk(<><path d="M19 12H5M11 6l-6 6 6 6" /></>),
  phone: mk(<><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L20 13l1 4v0a2 2 0 0 1-2 2A16 16 0 0 1 3 7a2 2 0 0 1 2-3Z" /></>),
  pin: mk(<><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>),
  warehouse: mk(<><path d="M3 21V8l9-4 9 4v13" /><path d="M7 21v-7h10v7" /><path d="M7 14h10M7 17.5h10" /></>),
  receipt: mk(<><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1Z" /><path d="M9 8h6M9 12h6" /></>),
  send: mk(<><path d="M21 3 3 10.5l6 2.5 2.5 6L21 3Z" /><path d="m9 13 4-4" /></>),
  layers: mk(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>),
  clock: mk(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  trash: mk(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  edit: mk(<><path d="M4 20h4L18 10l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>),
}
