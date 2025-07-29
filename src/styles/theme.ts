const theme = {
  colors: {
    primary: '#4ade80', // green-400
    background: '#ffffff', // white
    surface: '#f3f4f6', // gray-100
    text: '#111827', // gray-900
    subtext: '#6b7280', // gray-600
    border: '#d1d5db', // gray-300
    success: '#22c55e', // green-600
    error: '#ef4444', // red-600
    tint: '#2f95dc', // from Colors.ts
    tabIconDefault: '#ccc', // from Colors.ts
    tabIconSelected: '#2f95dc', // from Colors.ts
  },

  modes: {
    light: {
      text: '#000',
      background: '#fff',
      tint: '#2f95dc',
      tabIconDefault: '#ccc',
      tabIconSelected: '#2f95dc',
    },
    dark: {
      text: '#fff',
      background: '#000',
      tint: '#fff',
      tabIconDefault: '#ccc',
      tabIconSelected: '#fff',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 40,
    '3xl': 48,
    '4xl': 64,
    '5xl': 80,
    '6xl': 96,
  },

  fontSizes: {
    xs: 12,
    sm: 14,
    base: 16,
    md: 18,
    lg: 22,
    xl: 28,
    xxl: 36,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
    '6xl': 60,
  },

  fonts: {
    regular: 'Montseerrat_Regular',
    medium: 'Montserrat_Medium',
    semibold: 'Montserrat_SemiBold',
    bold: 'Montserrat_Bold',
  },

  radii: {
    sm: 4,
    md: 8,
    lg: 16,
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
