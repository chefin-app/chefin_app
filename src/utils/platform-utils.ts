import { Platform } from 'react-native';

type ShadowStyle = {
  shadowColor?: string;
  shadowOffset?: { width: number; height: number };
  shadowOpacity?: number;
  shadowRadius?: number;
  elevation?: number;
};

export function createShadowStyle(style: ShadowStyle): ShadowStyle {
  if (Platform.OS === 'ios') {
    // iOS uses shadow properties
    const { elevation, ...iosStyle } = style;
    return iosStyle;
  } else {
    // Android uses elevation only
    return { elevation: style.elevation ?? 3 };
  }
}
