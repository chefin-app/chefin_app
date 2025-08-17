import { StyleSheet, View, TouchableOpacity } from 'react-native';
import React from 'react';
import BaseText from './BaseText';
import { BaseTextProps } from './types';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateMessageProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionText?: string;
  onActionPress?: () => void;
  variant?: 'default' | 'search' | 'network' | 'cart' | 'favourites' | 'orders';
}

const emptyStateConfig = {
  default: {
    icon: 'document-outline' as keyof typeof Ionicons.glyphMap,
    iconColor: '#999999',
  },
  search: {
    icon: 'search-outline' as keyof typeof Ionicons.glyphMap,
    iconColor: '#999999',
  },
  network: {
    icon: 'cloud-offline-outline' as keyof typeof Ionicons.glyphMap,
    iconColor: '#F44336',
  },
  cart: {
    icon: 'bag-outline' as keyof typeof Ionicons.glyphMap,
    iconColor: '#999999',
  },
  favourites: {
    icon: 'heart-outline' as keyof typeof Ionicons.glyphMap,
    iconColor: '#999999',
  },
  orders: {
    icon: 'receipt-outline' as keyof typeof Ionicons.glyphMap,
    iconColor: '#999999',
  },
};

export default function EmptyStateMessage({
  icon,
  title,
  message,
  actionText,
  onActionPress,
  variant = 'default',
}: EmptyStateMessageProps) {
  const config = emptyStateConfig[variant];
  const displayIcon = icon || config.icon;
  const iconColor = config.iconColor;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name={displayIcon} sie={64} color={iconColor} />
      </View>

      <BaseText weight="semibold" color="primary" align="center" style={styles.title}>
        {title}
      </BaseText>
      {message && (
        <BaseText color="secondary" align="center" style={styles.message}>
          {message}
        </BaseText>
      )}

      {actionText && onActionPress && (
        <TouchableOpacity onPress={onActionPress} style={styles.actionButton}>
          <BaseText color="white" weight="semibold" style={styles.actionText}>
            {actionText}
          </BaseText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  iconContainer: {
    marginBottom: 24,
    opacity: 0.6,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 280,
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
