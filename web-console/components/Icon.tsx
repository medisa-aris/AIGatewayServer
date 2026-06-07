'use client';

/**
 * Carbon-style icon set on a 16×16 grid. Ported from the design's icons.jsx.
 * Each entry is raw SVG inner markup; Icon renders it into a sized <svg>.
 */

import type { CSSProperties } from 'react';

/** Icon name → SVG inner markup (authored on a 0 0 16 16 grid). */
const P: Record<string, string> = {
  menu: '<path d="M2 4h12v1H2zM2 7.5h12v1H2zM2 11h12v1H2z"/>',
  close: '<path d="M12.3 3.7l-.7-.7L8 6.6 4.4 3l-.7.7L7.3 7.3 3.7 11l.7.7L8 8l3.6 3.7.7-.7L8.7 7.3z"/>',
  add: '<path d="M8.5 7.5V3h-1v4.5H3v1h4.5V13h1V8.5H13v-1z"/>',
  search: '<path d="M11.7 11l3 3-.7.7-3-3a4.5 4.5 0 11.7-.7zM7 10.5A3.5 3.5 0 107 3.5a3.5 3.5 0 000 7z"/>',
  notification: '<path d="M8 14.5a1.5 1.5 0 001.5-1.4h-3A1.5 1.5 0 008 14.5zM13 11l-1-1V7a4 4 0 10-8 0v3l-1 1v.6h10zM11 10.5H5V7a3 3 0 016 0z"/>',
  settings: '<path d="M8 5.5A2.5 2.5 0 108 10.5 2.5 2.5 0 008 5.5zm0 4A1.5 1.5 0 118 6.5a1.5 1.5 0 010 3zM14 8.6v-1.2l-1.5-.3a4.6 4.6 0 00-.4-.9l.8-1.3-.8-.8-1.3.8a4.6 4.6 0 00-.9-.4L9.6 2H8.4l-.3 1.5a4.6 4.6 0 00-.9.4l-1.3-.8-.8.8.8 1.3a4.6 4.6 0 00-.4.9L4 7.4v1.2l1.5.3c.1.3.2.6.4.9l-.8 1.3.8.8 1.3-.8c.3.2.6.3.9.4l.3 1.5h1.2l.3-1.5c.3-.1.6-.2.9-.4l1.3.8.8-.8-.8-1.3c.2-.3.3-.6.4-.9z"/>',
  help: '<path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 11a5 5 0 110-10 5 5 0 010 10zm.6-3.2H7.5v-.3c0-.5.2-.9.7-1.2l.5-.4c.3-.2.4-.4.4-.7 0-.4-.3-.7-.8-.7s-.9.3-.9.9H6.3c0-1 .8-1.8 1.9-1.8s1.8.6 1.8 1.6c0 .5-.2.9-.7 1.2l-.4.3c-.3.2-.4.4-.4.7zM8 11.4a.7.7 0 110-1.4.7.7 0 010 1.4z"/>',
  chevronDown: '<path d="M8 10.5L3.5 6l.7-.7L8 9.1l3.8-3.8.7.7z"/>',
  chevronUp: '<path d="M8 5.5L12.5 10l-.7.7L8 6.9 4.2 10.7l-.7-.7z"/>',
  chevronRight: '<path d="M6 3.5L10.5 8 6 12.5l-.7-.7L9.1 8 5.3 4.2z"/>',
  chevronLeft: '<path d="M10 3.5L5.5 8 10 12.5l.7-.7L6.9 8l3.8-3.8z"/>',
  caretDown: '<path d="M8 10L4.5 6h7z"/>',
  overflow: '<path d="M8 4.5a1 1 0 110-2 1 1 0 010 2zm0 4.5a1 1 0 110-2 1 1 0 010 2zm0 4.5a1 1 0 110-2 1 1 0 010 2z"/>',
  edit: '<path d="M2 11.5V14h2.5l7.4-7.4-2.5-2.5zM13.8 4.2l-1.3-1.3a.6.6 0 00-.8 0l-1.1 1.1 2.5 2.5 1.1-1.1a.6.6 0 000-.8z"/>',
  trash: '<path d="M6 2v1H3v1h10V3h-3V2zM4 5v8a1 1 0 001 1h6a1 1 0 001-1V5zm3 7H6V7h1zm3 0H9V7h1z"/>',
  copy: '<path d="M10 2H4a1 1 0 00-1 1v8h1V3h6zm2 2H7a1 1 0 00-1 1v8a1 1 0 001 1h5a1 1 0 001-1V5a1 1 0 00-1-1zm0 9H7V5h5z"/>',
  download: '<path d="M8 10.5l3-3-.7-.7L8.5 8.6V2h-1v6.6L5.7 6.8l-.7.7zM3 12v1h10v-1z"/>',
  upload: '<path d="M8 2L5 5l.7.7L7.5 3.9V10h1V3.9l1.8 1.8.7-.7zM3 12v1h10v-1z"/>',
  filter: '<path d="M2 3v1l4.5 5v4l3-1.5V9L14 4V3z"/>',
  download2: '<path d="M13 9v3H3V9H2v4h12V9z"/><path d="M8 10.5l3-3-.7-.7L8.5 8.6V2h-1v6.6L5.7 6.8l-.7.7z"/>',
  dashboard: '<path d="M2 2h5v5H2zm0 7h5v5H2zM9 2h5v5H9zm0 7h5v5H9z"/>',
  model: '<path d="M8 1.5L2 4.5v7L8 14.5l6-3v-7zM8 2.6l4.4 2.2L8 7 3.6 4.8zM3 5.7l4.5 2.3v5L3 10.7zm10 0v5L8.5 13V8z"/>',
  route: '<path d="M4 2a2 2 0 00-.5 3.9V10A2 2 0 105.5 12H10a2 2 0 002-2V6.1A2 2 0 1010.5 4H6a2 2 0 00-2-2zm0 1a1 1 0 110 2 1 1 0 010-2zm8 2a1 1 0 110 2 1 1 0 010-2zM4 11a1 1 0 110 2 1 1 0 010-2z"/>',
  plug: '<path d="M10 2v3h1V2zM5 2v3h1V2zM4 6v2a4 4 0 003.5 4v2h1v-2A4 4 0 0012 8V6zm7 2a3 3 0 01-6 0V7h6z"/>',
  document: '<path d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5.5zM9 3l2.5 2.5H9zM5 7h6v1H5zm0 2.5h6v1H5zm0 2.5h4v1H5z"/>',
  idea: '<path d="M8 1.5A4.5 4.5 0 003.5 6c0 1.7 1 2.8 1.7 3.6.3.4.6.7.6 1V11h4.4v-.4c0-.3.3-.6.6-1C11.5 8.8 12.5 7.7 12.5 6A4.5 4.5 0 008 1.5zM6.2 12.5h3.6v1H6.2zm.4 1.7h2.8a1.4 1.4 0 01-2.8 0z"/>',
  server: '<path d="M2.5 2.5h11v4h-11zm0 7h11v4h-11zM4 4h1v1H4zm0 7h1v1H4zm8.5-7H7v1h5.5zm0 7H7v1h5.5z"/>',
  shield: '<path d="M8 1.5L3 3.5v4c0 3 2.1 5.5 5 6.5 2.9-1 5-3.5 5-6.5v-4zm0 1.1l4 1.6v3.3c0 2.3-1.6 4.4-4 5.3-2.4-.9-4-3-4-5.3V4.2zM7.4 9.6L5.7 7.9l-.7.7 2.4 2.4 4-4-.7-.7z"/>',
  money: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 12a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM8.5 4h-1v.9c-1 .2-1.6.8-1.6 1.7 0 1 .7 1.4 1.7 1.7.8.2 1 .4 1 .8s-.3.6-.9.6-1-.3-1-.9H5.6c0 .9.6 1.6 1.9 1.8V12h1v-1c1-.2 1.7-.8 1.7-1.8 0-1-.6-1.4-1.8-1.7-.7-.2-1-.4-1-.8s.3-.6.8-.6.9.3.9.8h1.1c0-.9-.6-1.5-1.6-1.7z"/>',
  gauge: '<path d="M8 3a6 6 0 00-5 9.3l.8-.6A5 5 0 118 4a5 5 0 014.2 7.7l.8.6A6 6 0 008 3zm2.8 2.6L8 8.4a.9.9 0 00-.9 1.5.9.9 0 001.6-.9z"/>',
  list: '<path d="M2 3.5h2v2H2zm3.5.5h8v1h-8zM2 7.5h2v2H2zm3.5.5h8v1h-8zM2 11.5h2v2H2zm3.5.5h8v1h-8z"/>',
  users: '<path d="M6 7.5A2.2 2.2 0 106 3a2.2 2.2 0 000 4.5zm0 1c-2 0-4 1-4 2.6V13h8v-1.9c0-1.6-2-2.6-4-2.6zm5-1a2 2 0 100-4 2 2 0 000 4zm0 1c-.4 0-.8 0-1.1.2.9.6 1.6 1.4 1.6 2.4V13H15v-1.7c0-1.5-1.9-2.3-4-2.3z"/>',
  lock: '<path d="M11 6V4.5a3 3 0 00-6 0V6H4v8h8V6zM6 4.5a2 2 0 014 0V6H6zM8.5 10.7V12h-1v-1.3a1 1 0 111 0z"/>',
  key: '<path d="M9.5 2a4 4 0 00-3.8 5.2L2 11v3h3v-1.5h1.5V11H8l1-1a4 4 0 00.5-8zm1 3a1 1 0 110-2 1 1 0 010 2z"/>',
  grip: '<path d="M6 3.5a1 1 0 11-2 0 1 1 0 012 0zm0 4.5a1 1 0 11-2 0 1 1 0 012 0zm0 4.5a1 1 0 11-2 0 1 1 0 012 0zM12 3.5a1 1 0 11-2 0 1 1 0 012 0zM12 8a1 1 0 11-2 0 1 1 0 012 0zm0 4.5a1 1 0 11-2 0 1 1 0 012 0z"/>',
  checkmark: '<path d="M6.5 11L3 7.5l.7-.7L6.5 9.6l5.8-5.8.7.7z"/>',
  checkmarkFill: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7 10.4L4.3 7.7l.7-.7L7 9l4-4 .7.7z"/>',
  warning: '<path d="M8 1.5L.5 14.5h15zM7.5 6h1v4h-1zm0 5h1v1.2h-1z"/>',
  warningAlt: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.5 4.5h1V9h-1zm0 5.5h1v1.3h-1z"/>',
  error: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm2.7 8.5l-.7.7L8 8.7 6 10.7l-.7-.7L7.3 8 5.3 6l.7-.7L8 7.3 10 5.3l.7.7L8.7 8z"/>',
  info: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm.5 9.7h-1V7h1zM8 5.8a.7.7 0 110-1.4.7.7 0 010 1.4z"/>',
  arrowUp: '<path d="M8 3l3.5 3.5-.7.7L8.5 4.9V13h-1V4.9L5.2 7.2l-.7-.7z"/>',
  arrowDown: '<path d="M8 13L4.5 9.5l.7-.7L7.5 11.1V3h1v8.1l2.3-2.3.7.7z"/>',
  arrowRight: '<path d="M9 3.5L13.5 8 9 12.5l-.7-.7L11.1 8.5H2v-1h9.1L8.3 4.2z"/>',
  play: '<path d="M4 2.5v11l9-5.5z"/>',
  refresh: '<path d="M13 8a5 5 0 01-9 3l.8-.6A4 4 0 1012 8h-2l2.5-2.5L15 8zM3 8a5 5 0 019-3l-.8.6A4 4 0 004 8h2l-2.5 2.5L1 8z"/><path d="M13 4.5V8h-1V5.5h-2.5v-1z" fill="none"/>',
  code: '<path d="M5.5 4.5L1.7 8l3.8 3.5.7-.7L3 8l3.2-2.8zm5 0l-.7.7L13 8l-3.2 2.8.7.7L14.3 8z"/>',
  layers: '<path d="M8 1.5L1.5 5 8 8.5 14.5 5zm0 1.1L12.4 5 8 7.4 3.6 5zM1.5 8L8 11.5 14.5 8l-1-.5L8 10.4 2.5 7.5zM1.5 11L8 14.5 14.5 11l-1-.5L8 13.4 2.5 10.5z"/>',
  time: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 12a5.5 5.5 0 110-11 5.5 5.5 0 010 11zM8.5 4.5h-1V8.3l2.7 2.7.7-.7-2.4-2.4z"/>',
  save: '<path d="M11 2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V5zm-6 .5h4V5H5zm6 10.5H5V9h6zM3.5 8V3h1v1.5h5V8z"/>',
  view: '<path d="M8 3.5C4.5 3.5 1.7 6 1 8c.7 2 3.5 4.5 7 4.5s6.3-2.5 7-4.5c-.7-2-3.5-4.5-7-4.5zm0 7.5A3 3 0 118 5a3 3 0 010 6zm0-5a2 2 0 100 4 2 2 0 000-4z"/>',
  viewOff: '<path d="M2 2.7l.7-.7 11.6 11.6-.7.7-2-2A7.4 7.4 0 018 12.5C4.5 12.5 1.7 10 1 8a8.4 8.4 0 012.4-3.2zm3.4 3.4A3 3 0 008 11a3 3 0 001.4-.4zM8 5a3 3 0 012.9 3.7L8.3 5.1A3 3 0 018 5zm6 3a8.4 8.4 0 01-1.8 2.6l-.7-.7A7.3 7.3 0 0014 8c-.8-1.7-3.2-3.5-6-3.5a6.6 6.6 0 00-1.3.1l-.8-.8A7.6 7.6 0 018 3.5c3.5 0 6.3 2.5 7 4.5z"/>',
  sun: '<path d="M8 5a3 3 0 100 6 3 3 0 000-6zm0 5a2 2 0 110-4 2 2 0 010 4zM7.5 1.5h1V3h-1zm0 11.5h1v1.5h-1zM1.5 7.5H3v1H1.5zm11.5 0h1.5v1H13zM3.3 3.3l1 1-.7.7-1-1zm8.4 8.4l1 1-.7.7-1-1zM12 4.3l1-1 .7.7-1 1zM3.3 12.7l1-1 .7.7-1 1z"/>',
  moon: '<path d="M9.5 1.7A6.5 6.5 0 108 14.5a6.5 6.5 0 005.8-3.6 5 5 0 01-4.3-9.2zM8 13.5a5.5 5.5 0 01-.6-11 5 5 0 005.9 8.7A5.5 5.5 0 018 13.5z"/>',
  grid: '<path d="M2 2h4v4H2zm5 0h4v4H7zm5 0h2v4h-2zM2 7h4v4H2zm5 0h4v4H7zm5 0h2v4h-2zM2 12h4v2H2zm5 0h4v2H7z"/>',
  globe: '<path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm4.4 4h-1.9a8 8 0 00-.8-2.2 5.5 5.5 0 012.7 2.2zM8 2.6c.5.5 1 1.4 1.3 2.9H6.7C7 4 7.5 3.1 8 2.6zM2.6 8.5h1.9c0 .6.1 1.3.3 1.9H3.4a5.5 5.5 0 01-.8-1.9zm.8-3h1.4a10 10 0 00-.3 2H2.6a5.5 5.5 0 01.8-2zM3.4 11h1.9c.2.8.5 1.6.8 2.2A5.5 5.5 0 013.4 11zM8 13.4c-.5-.5-1-1.4-1.3-2.9h2.6C9 12 8.5 12.9 8 13.4zm-1.5-3.9a10 10 0 010-2h3a10 10 0 010 2zm4.2 3.7c.4-.6.6-1.4.8-2.2h1.9a5.5 5.5 0 01-2.7 2.2zm1-3.7c0-.7.2-1.4.2-2h1.5a5.5 5.5 0 01-.3 2z"/>',
  link: '<path d="M6.7 9.3l-.7-.7 2.6-2.6.7.7zM5 11a2 2 0 010-2.8L6.5 6.7l.7.7L5.7 9a1 1 0 001.4 1.4L8.6 9l.7.7-1.5 1.4a2 2 0 01-2.8 0zm6-6a2 2 0 010 2.8L9.5 9.3l-.7-.7L10.3 7a1 1 0 00-1.4-1.4L7.4 7l-.7-.7 1.5-1.4a2 2 0 012.8 0z"/>',
  zap: '<path d="M9 1.5L4 8.5h3l-1 6 5-7H8z"/>',
  database: '<path d="M8 1.8c-2.8 0-5 .9-5 2v8.4c0 1.1 2.2 2 5 2s5-.9 5-2V3.8c0-1.1-2.2-2-5-2zm4 10.4c0 .4-1.5 1-4 1s-4-.6-4-1v-1.7c1 .5 2.4.7 4 .7s3-.2 4-.7zm0-3c0 .4-1.5 1-4 1s-4-.6-4-1V7.5c1 .5 2.4.7 4 .7s3-.2 4-.7zm-4-2c-2.5 0-4-.6-4-1s1.5-1 4-1 4 .6 4 1-1.5 1-4 1z"/>',
  flow: '<path d="M3 2.5h3v2H3zm7 0h3v2h-3zM3 11.5h3v2H3zm7 0h3v2h-3zM7 3h2v1H7zM4.5 5v3.5h7V5h-1v2.5h-5V5zM7 12h2v1H7z"/>',
  chartLine: '<path d="M2 2v12h12v-1H3V2zm11 2.5l-.7-.7-3 3-2-2L4.5 8l.7.7L7.3 6.4l2 2z"/>',
  bot: '<path d="M7.5 1.5h1V3h2a1 1 0 011 1v1h.5a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h.5V4a1 1 0 011-1h2zM5.5 5h5V4h-5zm-1.5 6h8V6H4zm1.5-3.5a.8.8 0 110 1.6.8.8 0 010-1.6zm5 0a.8.8 0 110 1.6.8.8 0 010-1.6zM6.5 10h3v.8h-3z"/>',
  flag: '<path d="M4 2v12h1V9h7l-1.5-2.5L12 4H5V2zm1 1h5.3l-1 1.5 1 1.5H5z"/>',
  star: '<path d="M8 1.8l1.7 3.6 3.9.5-2.9 2.7.8 3.9L8 12.6l-3.5 1.9.8-3.9L2.4 6l3.9-.5z"/>',
  folder: '<path d="M2 3.5h4l1 1.5h7v8H2zm1 1V12h10V6H6.5l-1-1.5z"/>',
  branch: '<path d="M5 2.5a1.5 1.5 0 00-.5 2.9v5.2a1.5 1.5 0 101 0V8.4c.4.3.9.5 1.5.5h2.1a1.5 1.5 0 100-1H8c-.8 0-1.5-.7-1.5-1.5v-1A1.5 1.5 0 005 2.5z"/>',
  activity: '<path d="M6 2L3.5 9H1v1h3.2L6 5l3 8 1.8-4.5H15v-1h-3.8L9.5 12z"/>',
  table: '<path d="M2 3h12v10H2zm1 1v2h4V4zm5 0v2h5V4zM3 7v2h4V7zm5 0v2h5V7zM3 10v2h4v-2zm5 0v2h5v-2z"/>',
  expand: '<path d="M3 3h4v1H4v3H3zm6 0h4v4h-1V4H9zM3 9h1v3h3v1H3zm9 0h1v4H9v-1h3z"/>',
  apiKey: '<path d="M10 2a4 4 0 00-3.9 5L2 11.1V14h2.9l.7-.7v-1.4h1.4l.7-.7v-1l.4-.4A4 4 0 1010 2zm1.5 3.5a1 1 0 110-2 1 1 0 010 2z"/>',
  cloud: '<path d="M11.5 6.5a3.5 3.5 0 00-6.7-1A2.8 2.8 0 005 11h6.2a2.3 2.3 0 00.3-4.5zM11 10H5a1.8 1.8 0 01-.1-3.6l.4-.1.1-.4a2.5 2.5 0 014.8.7v.5l.5.1a1.3 1.3 0 01-.2 2.6z"/>',
  fingerprint: '<path d="M8 2a5 5 0 00-5 5v1.5h1V7a4 4 0 018 0v2a3 3 0 01-3 3v1a4 4 0 004-4V7a5 5 0 00-5-5zm0 2.5A2.5 2.5 0 005.5 7v2.5a1.5 1.5 0 01-1.5 1.5v1a2.5 2.5 0 002.5-2.5V7a1.5 1.5 0 013 0v2h1V7A2.5 2.5 0 008 4.5zM7.5 7v2.5a3 3 0 01-1.2 2.4l.6.8A4 4 0 008.5 9.5V7z"/>',
  logout: '<path d="M6 2v1H4v10h2v1H3V2zm4.5 3.5l-.7.7L11.1 7.5H6v1h5.1l-1.3 1.3.7.7L13 8z"/>',
  dot: '<circle cx="8" cy="8" r="3"/>',
  sliders: '<path d="M2 4h6V3H2zm10 0h2V3h-2zm-3-2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM2 8.5h2v-1H2zm6 0h6v-1H8zM5 6a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM2 13h8v-1H2zm12 0h0v-1h0zm-3-2a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>',
  bell: '<path d="M8 14.5a1.5 1.5 0 001.5-1.4h-3A1.5 1.5 0 008 14.5zM13 11l-1-1V7a4 4 0 10-8 0v3l-1 1v.6h10z"/>',
  calendar: '<path d="M5 1.5v1H3v11h10v-11h-2v-1h-1v1H6v-1zm6 3v1H5v-1zm0 2.5v5H5V7z"/>',
  blueprint: '<path d="M1.5 2.5h13v1.4h-13zM1.5 12.1h13v1.4h-13zM1.5 2.5h1.4v11H1.5zM13.1 2.5h1.4v11h-1.4zM4 5.6h3v2H4zm5 0h3v2H9zM6 9h4v2H6z"/>',
};

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** Renders a single 16-grid icon by name. */
export function Icon({ name, size = 16, className = '', style, title }: IconProps) {
  const inner = P[name] ?? P.dot!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={'icn ' + className}
      fill="currentColor"
      style={{ display: 'block', flexShrink: 0, ...style }}
      aria-hidden={title ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + inner }}
    />
  );
}

/** Per-provider brand config: background color + white SVG path on a 16×16 grid. */
const PROVIDER_LOGO_CONFIGS: Record<string, { bg: string; path: string }> = {
  // OpenAI — 6-petal bloom (the rotating gear mark)
  openai: {
    bg: '#10a37f',
    path: `<g fill="#fff">
      <path d="M8 2.5a1.1 1.1 0 00-1 .6L5.2 6.4a2.2 2.2 0 00-.1 1.6l.6 1.8-1.6 1.2a1.1 1.1 0 000 1.8l1.6 1.2-.6 1.8a1.1 1.1 0 001.4 1.4l1.8-.6 1.2 1.6a1.1 1.1 0 001.8 0l1.2-1.6 1.8.6a1.1 1.1 0 001.4-1.4l-.6-1.8 1.6-1.2a1.1 1.1 0 000-1.8l-1.6-1.2.6-1.8A1.1 1.1 0 0013 3.4l-1.8.6L10 2.5a1.1 1.1 0 00-.9-.5H8zm0 1.2h.1l1.3 1.7.3.4.5-.2 2-.6.2.3-.6 2-.2.5.4.3 1.7 1.3v.3l-1.7 1.3-.4.3.2.5.6 2-.3.2-2-.6-.5-.2-.3.4-1.3 1.7h-.3L6.1 12l-.3-.4-.5.2-2 .6-.2-.3.6-2 .2-.5-.4-.3L1.8 8v-.3l1.7-1.3.4-.3-.2-.5-.6-2 .3-.2 2 .6.5.2.3-.4 1.3-1.7h.3zM8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm0 1a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>
    </g>`,
  },
  // Anthropic — the A-prism triangle
  anthropic: {
    bg: '#cc785c',
    path: `<path fill="#fff" d="M8 2.5L3.5 13.5h2.3l.9-2.3h2.6l.9 2.3h2.3L8 2.5zm0 3.3l.9 2.4H7.1l.9-2.4z"/>`,
  },
  // Azure — the angled A with cross-bar (Azure wave mark)
  azure: {
    bg: '#0078d4',
    path: `<path fill="#fff" d="M6.5 2.5L3 13h2.5l.7-2h3.6l.7 2H13L9.5 2.5h-3zm1.5 2l1.2 3.4H6.8L8 4.5z"/>`,
  },
  // Google — white G letterform on blue
  google: {
    bg: '#4285f4',
    path: `<path fill="#fff" d="M8 3.5A4.5 4.5 0 003.5 8 4.5 4.5 0 008 12.5a4.5 4.5 0 004.4-3.7H8.5V7.3H13a4.5 4.5 0 01-5 5.2A4.5 4.5 0 013.5 8 4.5 4.5 0 018 3.5a4.4 4.4 0 013 1.2l-1.3 1.2A2.8 2.8 0 008 5.1a2.9 2.9 0 00-2.9 2.9A2.9 2.9 0 008 10.9a2.8 2.8 0 002.8-2.2H8.5V7.3H13z"/>`,
  },
  // AWS — arrow + arc smile (AWS logo style)
  aws: {
    bg: '#232f3e',
    path: `<g fill="#ff9900">
      <path d="M4.8 9.8a5 5 0 006.4 0l-.6-.7a4 4 0 01-5.2 0z"/>
    </g>
    <path fill="#fff" d="M7.5 3v5.5h1V3zm-1 1.5L8 3l1.5 1.5-.7.7L8 4.5l-.8.7zm3.5 6.5h1v1h-1zm-5 0H4v1h1z"/>`,
  },
  // Mistral — three angled tile blocks (their brand mark)
  mistral: {
    bg: '#f55036',
    path: `<path fill="#fff" d="M3 4h2v3H3zm4 0h2v3H7zm4 0h2v3h-2zM3 9h2v3H3zm4 0h2v3H7zm4 0h2v3h-2z"/>`,
  },
  // Moonshot (Kimi) — crescent moon
  moonshot: {
    bg: '#1a1a2e',
    path: `<path fill="#fff" d="M10.5 5.3A4.5 4.5 0 016.2 4a4.5 4.5 0 00.3 8 4.5 4.5 0 004-6.7z"/>`,
  },
  // Qwen (Alibaba) — stylised Q
  qwen: {
    bg: '#7c3aed',
    path: `<path fill="#fff" d="M8 3.5A4.5 4.5 0 003.5 8 4.5 4.5 0 008 12.5a4.5 4.5 0 004.5-4.5A4.5 4.5 0 008 3.5zm0 1.5a3 3 0 013 3 3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3zm1.8 4.2l1.4 1.4-.7.7-1.5-1.5z"/>`,
  },
  // Perplexity — 4-arm asterisk
  perplexity: {
    bg: '#20808d',
    path: `<path fill="#fff" d="M7.5 2v4.2L4.3 3l-.7.7 3.2 3.2H2.5v1H7v4.6l-3.2-3.2-.7.7 3.2 3.2H2.5v1H7v1.3h1v-1.3h4.5v-1H9.2l3.2-3.2-.7-.7-3.2 3.2V8.9h4.5v-1H8.5L11.7 4.6l-.7-.7L7.5 7.2V2h-1z"/>`,
  },
  // Ollama — llama head silhouette
  ollama: {
    bg: '#272727',
    path: `<path fill="#fff" d="M8 2.5c-1.7 0-3 1.3-3 3 0 1 .5 1.9 1.3 2.4L5.5 13h5l-1.8-5.1c.8-.5 1.3-1.4 1.3-2.4 0-1.7-1.3-3-3-3zm0 1.2c1 0 1.8.8 1.8 1.8 0 1-.8 1.8-1.8 1.8S6.2 6.5 6.2 5.5c0-1 .8-1.8 1.8-1.8zm-1 4.6h2l1.2 3.5H5.8l1.2-3.5z"/>`,
  },
};

/**
 * ProviderLogo renders a colored rounded square with a white SVG brand mark
 * for the given provider type (e.g. 'openai', 'azure'). Falls back to a
 * two-letter monogram for unknown types.
 *
 * type — lowercase provider_type value from the provider_accounts table.
 * size — rendered square side in px (default 36).
 */
export function ProviderLogo({ type, size = 36 }: { type: string; size?: number }) {
  const key = type.toLowerCase();
  const cfg = PROVIDER_LOGO_CONFIGS[key];
  const radius = Math.round(size * 0.2);
  const iconSize = Math.round(size * 0.65);

  if (!cfg) {
    const initials = (type || '?').slice(0, 2).toUpperCase();
    return (
      <span
        style={{
          width: size, height: size, borderRadius: radius,
          background: '#525252', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
          fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em',
        }}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      style={{
        width: size, height: size, borderRadius: radius,
        background: cfg.bg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: cfg.path }}
      />
    </span>
  );
}

/** Backward-compatible alias — existing pages pass a display name like "OpenAI". */
export function ProviderMark({ name, size = 24 }: { name: string; size?: number }) {
  const typeMap: Record<string, string> = {
    'OpenAI': 'openai', 'Anthropic': 'anthropic',
    'Azure OpenAI': 'azure', 'Google Vertex': 'google', 'Google': 'google',
    'AWS Bedrock': 'aws', 'AWS': 'aws',
    'Mistral': 'mistral', 'Moonshot': 'moonshot', 'Qwen': 'qwen',
    'Perplexity': 'perplexity', 'Ollama': 'ollama',
    'Groq': 'openai',
  };
  return <ProviderLogo type={typeMap[name] ?? name.toLowerCase()} size={size} />;
}
