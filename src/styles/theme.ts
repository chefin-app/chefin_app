/**
 * Mobile design tokens.
 *
 * These values mirror the Figma library ("Chefin Design System"); the names
 * below match the Figma variable names, so `colors.primary` here is
 * `color/primary` there. Keep the two in step when either changes.
 *
 * Only Regular / SemiBold / Bold are registered in app/_layout.tsx, so
 * `fonts` exposes exactly those three aliases and nothing else.
 */
const theme = {
  colors: {
    // Brand
    primary: '#4CAF50', // accents, borders, icons
    /**
     * Filled buttons and other large green surfaces carrying white text.
     * #4CAF50 on white is 2.78:1 and fails WCAG AA; this is 5.36:1.
     */
    primaryAction: '#237A3B',
    primarySoft: '#E8F5E9', // tinted backgrounds
    primaryDisabled: '#A5D6A7',
    /**
     * Dark green for text and icons sitting on a light background — section
     * eyebrows, inline links, active filter labels. Consolidates the
     * near-identical #2E7D32 / #216E39 / #1B5E20 that were used
     * interchangeably for this role.
     */
    primaryOnLight: '#237A3B',

    // Surfaces
    background: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F8F9FA',
    surfaceMuted: '#F5F5F5',

    // Text
    text: '#1A1A1A',
    textStrong: '#333333',
    textSecondary: '#666666',
    textMuted: '#888888',
    textOnAction: '#FFFFFF',
    placeholder: '#999999',

    // Lines
    border: '#E0E0E0',
    separator: '#F0F0F0',

    // Status
    success: '#18884B',
    error: '#B42318',
    /** Border on an errored input or alert card. */
    errorBorder: '#D92D20',
    /** Tinted background behind inline error messaging. */
    errorSoft: '#FEF3F2',
    warning: '#8A5B00',
    warningSoft: '#FFF4D6',
    /** Destructive affordances — delete, clear basket, remove account. */
    destructive: '#FF4D4D',
    /**
     * Secondary action link in the cook console — "Edit", "Add", "Create
     * schedule". Deliberately blue so it reads as a link rather than a
     * primary green CTA.
     */
    link: '#1473E6',

    /** Password-strength meter — four steps, weakest to strongest. */
    strength: {
      weak: '#FF5252',
      fair: '#FF9800',
      good: '#2196F3',
      strong: '#4CAF50',
    },
    star: '#E4A11B',
    /** MaterialIcons "verified" badge — intentionally blue, not brand green. */
    verified: '#0084FF',

    // Tab bar
    inactive: '#888888',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
  },

  fontSizes: {
    caption: 10,
    small: 12,
    body: 14,
    base: 16,
    subtitle: 18,
    title: 22,
    display: 28,
  },

  lineHeights: {
    caption: 14,
    small: 16,
    body: 20,
    base: 22,
    subtitle: 24,
    title: 28,
    display: 34,
  },

  /** Aliases registered by useFonts in app/_layout.tsx. */
  fonts: {
    regular: 'mon',
    semibold: 'mon-sb',
    bold: 'mon-b',
  },

  radii: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    pill: 9999,
  },

  shadows: {
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
  },
};

export type Theme = typeof theme;
export default theme;
