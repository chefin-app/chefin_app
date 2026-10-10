import { StyleSheet } from 'react-native';

import theme from '@/src/styles/theme';

/**
 * Typography primitives for BaseText and everything built on it.
 *
 * Every fontFamily here MUST be an alias registered by useFonts in
 * app/_layout.tsx — an unregistered name does not error, it silently falls back
 * to the system font. Only `mon`, `mon-m`, `mon-sb` and `mon-b` are registered.
 */
export const typography = StyleSheet.create({
  fontFamily: {
    fontFamily: theme.fonts.regular,
  },

  // Colors — these mirror the Figma `color/text/*` variables.
  color_primary: { color: theme.colors.text },
  color_secondary: { color: theme.colors.textSecondary },
  color_muted: { color: theme.colors.textMuted },
  color_white: { color: theme.colors.textOnAction },
  color_success: { color: theme.colors.success },
  color_error: { color: theme.colors.error },
  color_accent: { color: theme.colors.primary },

  // Weights
  weight_regular: { fontFamily: theme.fonts.regular },
  weight_medium: { fontFamily: 'mon-m' },
  weight_semibold: { fontFamily: theme.fonts.semibold },
  weight_bold: { fontFamily: theme.fonts.bold },

  // Alignments
  align_left: { textAlign: 'left' },
  align_center: { textAlign: 'center' },
  align_right: { textAlign: 'right' },
});
