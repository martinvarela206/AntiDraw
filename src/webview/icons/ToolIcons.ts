export const ToolIcons = {
  select: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3l7 18 3-7 7-3L3 3z"/>
  </svg>`,

  stroke: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 15c4-6 10-6 15-2" stroke-width="2.5"/>
    <path d="M18 10l3 3-3 3" stroke-width="1.8"/>
    <line x1="3" y1="21" x2="21" y2="21" stroke-width="1.5" stroke-dasharray="2 2"/>
  </svg>`,

  node: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/>
    <rect x="3" y="3" width="4" height="4" rx="1"/>
    <rect x="17" y="3" width="4" height="4" rx="1"/>
    <rect x="3" y="17" width="4" height="4" rx="1"/>
    <rect x="17" y="17" width="4" height="4" rx="1"/>
  </svg>`,

  polyline: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 19 8 7 16 13 20 5"/>
    <circle cx="4" cy="19" r="2" fill="currentColor"/>
    <circle cx="8" cy="7" r="2" fill="currentColor"/>
    <circle cx="16" cy="13" r="2" fill="currentColor"/>
    <circle cx="20" cy="5" r="2" fill="currentColor"/>
  </svg>`,

  pen: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
    <path d="M2 2l7.5 7.5"/>
    <circle cx="11" cy="11" r="2"/>
  </svg>`,

  line: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="5" y1="19" x2="19" y2="5"/>
  </svg>`,

  rect: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>`,

  circle: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="8"/>
  </svg>`,

  ellipse: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <ellipse cx="12" cy="12" rx="9" ry="5.5"/>
  </svg>`,

  polygon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
    <polygon points="12 3 21 8.5 21 17.5 12 21 3 17.5 3 8.5"/>
  </svg>`,

  star: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>`,

  addVertex: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M4 12h16"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>
    <line x1="12" y1="5" x2="12" y2="19"/>
  </svg>`,

  canvas: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2"/>
    <path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>
  </svg>`,

  zoom: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="6"/>
    <line x1="16" y1="16" x2="21" y2="21"/>
    <line x1="11" y1="8" x2="11" y2="14"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>`,

  ruler: `<svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="1,31 13,31 12.9,12.89 30.94,12.99 31,1 1,1" />
    <line x1="15" y1="12" x2="15" y2="7" />
    <line x1="21" y1="12" x2="21" y2="5" />
    <line x1="27" y1="12" x2="27" y2="7" />
    <line x1="12" y1="15" x2="7" y2="15" />
    <line x1="12" y1="27" x2="7" y2="27" />
    <line x1="12" y1="21" x2="4" y2="21" />
  </svg>`,

  rulers: `<svg viewBox="0 0 32 32" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="1,31 13,31 12.9,12.89 30.94,12.99 31,1 1,1" />
    <line x1="15" y1="12" x2="15" y2="7" />
    <line x1="21" y1="12" x2="21" y2="5" />
    <line x1="27" y1="12" x2="27" y2="7" />
    <line x1="12" y1="15" x2="7" y2="15" />
    <line x1="12" y1="27" x2="7" y2="27" />
    <line x1="12" y1="21" x2="4" y2="21" />
  </svg>`,

  rulerCorner: `<svg viewBox="0 0 32 32" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="1,31 13,31 12.9,12.89 30.94,12.99 31,1 1,1" />
    <line x1="15" y1="12" x2="15" y2="7" />
    <line x1="21" y1="12" x2="21" y2="5" />
    <line x1="27" y1="12" x2="27" y2="7" />
    <line x1="12" y1="15" x2="7" y2="15" />
    <line x1="12" y1="27" x2="7" y2="27" />
    <line x1="12" y1="21" x2="4" y2="21" />
  </svg>`,

  grid: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5">
    <rect x="3" y="3" width="18" height="18"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
    <line x1="15" y1="3" x2="15" y2="21"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="3" y1="15" x2="21" y2="15"/>
  </svg>`,

  guide: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3">
    <line x1="12" y1="2" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
  </svg>`,

  snapGrid: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
    <circle cx="18" cy="6" r="1.5" fill="currentColor"/>
    <circle cx="6" cy="18" r="1.5" fill="currentColor"/>
    <circle cx="18" cy="18" r="1.5" fill="currentColor"/>
    <path d="M12 6v12M6 12h12"/>
  </svg>`,

  snapGuide: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="3 3"/>
    <circle cx="12" cy="12" r="3.5" fill="none"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <path d="M4 12h4M16 12h4"/>
  </svg>`,

  snapVertex: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="4" fill="none"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
    <path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>
  </svg>`,

  snapEdge: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M3 17C8 17 8 7 13 7s5 10 8 10" stroke-dasharray="3 2"/>
    <circle cx="13" cy="7" r="3.5" fill="none"/>
    <circle cx="13" cy="7" r="1.5" fill="currentColor"/>
  </svg>`,

  snapViewBox: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
    <rect x="4" y="4" width="16" height="16" stroke-dasharray="2 2" rx="1"/>
    <circle cx="4" cy="4" r="1.5" fill="currentColor"/>
    <circle cx="20" cy="4" r="1.5" fill="currentColor"/>
    <circle cx="4" cy="20" r="1.5" fill="currentColor"/>
    <circle cx="20" cy="20" r="1.5" fill="currentColor"/>
    <path d="M12 9v6M9 12h6" stroke-width="1.5"/>
  </svg>`,

  snapAngular: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <line x1="4" y1="20" x2="20" y2="20"/>
    <line x1="4" y1="20" x2="18" y2="6"/>
    <path d="M11 20a7 7 0 0 0-4-6.2" stroke-width="1.5"/>
    <circle cx="18" cy="6" r="1.5" fill="currentColor"/>
    <circle cx="4" cy="20" r="1.5" fill="currentColor"/>
    <path d="M14 13l2-2" stroke-width="1.5" stroke-dasharray="1 1"/>
  </svg>`,

  // Boolean Ops
  union: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="4" width="11" height="11" rx="1"/>
    <rect x="9" y="9" width="11" height="11" rx="1"/>
  </svg>`,

  subtract: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path fill-rule="evenodd" d="M4 4h11v5h5v11H9v-5H4V4zm5 5v2h2V9H9z" />
  </svg>`,

  intersect: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="4" width="11" height="11" rx="1" stroke-dasharray="2 2"/>
    <rect x="9" y="9" width="11" height="11" rx="1" stroke-dasharray="2 2"/>
    <rect x="9" y="9" width="6" height="6" fill="currentColor"/>
  </svg>`,

  exclude: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="4" width="11" height="11" fill="currentColor" fill-opacity="0.5"/>
    <rect x="9" y="9" width="11" height="11" fill="currentColor" fill-opacity="0.5"/>
  </svg>`,

  combine: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="9" cy="9" r="6"/>
    <circle cx="15" cy="15" r="6"/>
  </svg>`,

  fragment: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" fill-opacity="0.3"/>
    <rect x="13" y="13" width="8" height="8" rx="1" fill="currentColor" fill-opacity="0.3"/>
    <rect x="8" y="8" width="8" height="8" rx="1" fill="currentColor"/>
  </svg>`,

  // Alignments
  alignLeft: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="2" x2="4" y2="22"/><rect x="8" y="5" width="12" height="5" rx="1"/><rect x="8" y="14" width="8" height="5" rx="1"/></svg>`,
  alignCenter: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"/><rect x="6" y="5" width="12" height="5" rx="1"/><rect x="8" y="14" width="8" height="5" rx="1"/></svg>`,
  alignRight: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="20" y1="2" x2="20" y2="22"/><rect x="4" y="5" width="12" height="5" rx="1"/><rect x="8" y="14" width="8" height="5" rx="1"/></svg>`,
  alignTop: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="4" x2="22" y2="4"/><rect x="5" y="8" width="5" height="12" rx="1"/><rect x="14" y="8" width="5" height="8" rx="1"/></svg>`,
  alignMiddle: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12"/><rect x="5" y="6" width="5" height="12" rx="1"/><rect x="14" y="8" width="5" height="8" rx="1"/></svg>`,
  alignBottom: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="20" x2="22" y2="20"/><rect x="5" y="4" width="5" height="12" rx="1"/><rect x="14" y="8" width="5" height="8" rx="1"/></svg>`,

  // Z-Order
  bringFront: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/><line x1="4" y1="3" x2="20" y2="3"/></svg>`,
  bringForward: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  sendBackward: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
  sendBack: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`,

  // Flip / Mirror
  flipHorizontal: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="2 2"/><path d="M8 7L2 12l6 5V7z" fill="currentColor" fill-opacity="0.3"/><path d="M16 7l6 5-6 5V7z"/></svg>`,
  flipVertical: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2"/><path d="M7 8l5-6 5 6H7z" fill="currentColor" fill-opacity="0.3"/><path d="M7 16l5 6 5-6H7z"/></svg>`,

  // Node modes
  nodeSharp: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L12 5L20 19"/><circle cx="12" cy="5" r="3" fill="currentColor"/></svg>`,
  nodeAsymmetric: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M4 18l5-4M15 10l5-4"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/></svg>`,
  nodeSmooth: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="4" y1="18" x2="20" y2="6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/></svg>`,
  nodeSymmetric: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3" fill="currentColor"/><line x1="5" y1="17" x2="19" y2="7"/><circle cx="5" cy="17" r="2.5" fill="currentColor"/><circle cx="19" cy="7" r="2.5" fill="currentColor"/></svg>`,
  splitNode: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="12" r="2.5"/><circle cx="16" cy="12" r="2.5"/><path d="M10.5 12h3" stroke-dasharray="2 2"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 7"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 7"/></svg>`,
};
