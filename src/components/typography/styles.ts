import { StyleSheet } from 'react-native';

export const typography = StyleSheet.create({
  fontFamily: {
    fontFamily: 'Montserrat-Regular',
  },

  // Colors
  color_primary: { color: '#000000' },
  color_secondary: { color: '#666666' },
  color_muted: { color: '#999999' },
  color_white: { color: '#FFFFFF' },
  color_success: { color: '#4CAF50' },
  color_error: { color: '#F44336' },
  color_accent: { color: '#FF6B35' },

  // Weights
  weight_thin: { fontFamily: 'Montserrat-Thin' },
  weight_light: { fontFamily: 'Montserrat-Light' },
  weight_regular: { fontFamily: 'Montserrat-Regular' },
  weight_medium: { fontFamily: 'Montserrat-Medium' },
  weight_semibold: { fontFamily: 'Montserrat-SemiBold' },
  weight_bold: { fontFamily: 'Montserrat-Bold' },
  weight_extrabold: { fontFamily: 'Montserrat-ExtraBold' },
  weight_black: { fontFamily: 'Montserrat-Black' },

  // Alignments
  align_left: { textAlign: 'left' },
  align_center: { textAlign: 'center' },
  align_right: { textAlign: 'right' },
});
