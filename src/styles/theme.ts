const theme = {
  colors: {
    primary: "#4ade80", // green-400
    // secondary: ,
    background: "#ffffff", // white
    surface: "#f3f4f6", // gray-100
    text: "#111827", // gray-900
    subtext: "#6b7280", // gray-600
    border: "#d1d5db", // gray-300
    success: "#22c55e", // green-600
    error: "#ef4444", // red-600
  },

  spacing: {
    xs: 4, // 0.25rem
    sm: 8, // 0.5rem
    md: 16, // 1rem
    lg: 24, // 1.5rem
    xl: 32, // 2rem
    "2xl": 40, // 2.5rem
    "3xl": 48, // 3rem
    "4xl": 64, // 4rem
    "5xl": 80, // 5rem
    "6xl": 96, // 6rem
  },

  fontSizes: {
    xs: 12, // 0.75rem
    sm: 14, // 0.875rem
    base: 16,
    md: 18,
    lg: 22,
    xl: 28,
    xxl: 36,
    "2xl": 24, // 1.5rem
    "3xl": 30, // 1.875rem
    "4xl": 36, // 2.25rem
    "5xl": 48, // 3rem
    "6xl": 60, // 3.75rem
  },

  fonts: {
    regular: "Montseerrat_Regular",
    medium: "Montserrat_Medium",
    semibold: "Montserrat_SemiBold",
    bold: "Montserrat_Bold",
  },

  radii: {
    sm: 4,
    md: 8,
    lg: 16,
    pill: 9999, // for circular buttons
  },

  shadows: {
    default: {
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
  },
};

export type Theme = typeof theme;
export default theme;
