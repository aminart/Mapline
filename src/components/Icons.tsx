// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ReactNode } from 'react';

function Svg({ size = 16, width = 2, children }: { size?: number; width?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const PlusIcon = ({ size }: P) => (
  <Svg size={size} width={2.4}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const MinusIcon = ({ size }: P) => (
  <Svg size={size} width={2.4}>
    <path d="M5 12h14" />
  </Svg>
);
export const CloseIcon = ({ size = 13 }: P) => (
  <Svg size={size} width={2.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
export const ChevronLeft = ({ size = 14 }: P) => (
  <Svg size={size} width={2.4}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);
export const ChevronRight = ({ size = 14 }: P) => (
  <Svg size={size} width={2.4}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const ChevronDown = ({ size = 14 }: P) => (
  <Svg size={size} width={2.4}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
/** A decision point, as on choice cards. */
export const DiamondIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M12 3l9 9-9 9-9-9z" />
  </Svg>
);
export const UndoIcon = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
  </Svg>
);
export const RedoIcon = ({ size = 18 }: P) => (
  <Svg size={size}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9a5 5 0 0 0 0 10h3" />
  </Svg>
);
export const DownloadIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </Svg>
);
export const FolderIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
export const CursorIcon = ({ size = 15 }: P) => (
  <Svg size={size}>
    <path d="M5 3l14 8-6 2-2 6z" />
  </Svg>
);
export const LinkIcon = ({ size = 15 }: P) => (
  <Svg size={size}>
    <path d="M4 18c6 0 4-12 12-12" />
    <path d="m13 3 3 3-3 3" />
    <circle cx="4" cy="18" r="1.5" />
  </Svg>
);
export const ImageIcon = ({ size = 26 }: P) => (
  <Svg size={size} width={1.8}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="m21 16-5-5-9 9" />
  </Svg>
);
export const LogoIcon = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2F55D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M17.5 14v7M14 17.5h7" />
  </svg>
);
export const GripIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);
export const PlayIcon = ({ size = 16 }: P) => (
  <Svg size={size}>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
);
export const TagIcon = ({ size = 15 }: P) => (
  <Svg size={size}>
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.5" />
  </Svg>
);
export const LineIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M3 12h3M10 12h4M18 12h3" />
  </Svg>
);
/** A dashed line with a small arrow pointing up: a line above. */
export const LineAboveIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M3 8h3M10 8h4M18 8h3M12 20v-8M9 15l3-3 3 3" />
  </Svg>
);
export const CheckIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
/** Two stacked cards: an alternative below. */
export const SplitIcon = ({ size = 13 }: P) => (
  <Svg size={size}>
    <rect x="5" y="3" width="14" height="7" rx="1.5" />
    <rect x="5" y="14" width="14" height="7" rx="1.5" />
  </Svg>
);
export const NoteIcon = ({ size = 13 }: P) => (
  <Svg size={size}>
    <path d="M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M15 20v-4a1 1 0 0 1 1-1h4M8 9h8M8 13h5" />
  </Svg>
);
export const PersonIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
);
export const MapIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 10v10" />
  </Svg>
);
export const CameraIcon = ({ size = 15 }: P) => (
  <Svg size={size}>
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <circle cx="12" cy="13" r="3.5" />
    <path d="M8 6l2-2h4l2 2" />
  </Svg>
);
export const FlowIcon = ({ size = 14 }: P) => (
  <Svg size={size}>
    <rect x="2" y="9" width="6" height="6" rx="1" />
    <path d="M8 12h4M16 12l3-3 3 3-3 3z" />
  </Svg>
);
