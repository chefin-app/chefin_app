import { StyleSheet, View } from 'react-native';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import BaseText from './BaseText';
import { BaseTextProps } from './types';

interface InlineErrorTextProps extends Omit<BaseTextProps, 'color'> {
  showIcon?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export default function InlineErrorText({
  children,
  showIcon = true,
  iconName = 'alert-circle',
  style,
  ...props
}: InlineErrorTextProps) {
  if (!children) return null;

  return (
    <View style={styles.container}>
      {showIcon && <Ionicons name={iconName} size={16} color="#F44336" style={styles.icon} />}
      <BaseText weight="medium" style={[styles.errorText, style]} color="error" {...props}>
        {children}
      </BaseText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  icon: {
    marginTop: 1,
    marginRight: 6,
    flexShrink: 0,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
});
