import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/src/styles/theme';

type SocialButtonName = 'facebook' | 'apple' | 'google' | 'email';
type SocialMediaButtonsProps = {
  buttonName: SocialButtonName;
  onPress?: () => void;
  disabled?: boolean;
};
const SocialMediaButtons: React.FC<SocialMediaButtonsProps> = ({
  buttonName,
  onPress,
  disabled = false,
}) => {
  if (buttonName === 'facebook') {
    return (
      <TouchableOpacity
        style={[styles.facebookButton, disabled && styles.disabledButton]}
        onPress={onPress}
        disabled={disabled}
        accessibilityState={{ disabled }}
      >
        <View style={styles.socialButtonContent}>
          <Ionicons name="logo-facebook" size={20} color={theme.colors.textOnAction} />
          <Text style={styles.facebookButtonText}>Continue with Facebook</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (buttonName === 'apple') {
    return (
      <TouchableOpacity
        style={[styles.appleButton, disabled && styles.disabledButton]}
        onPress={onPress}
        disabled={disabled}
        accessibilityState={{ disabled }}
      >
        <View style={styles.socialButtonContent}>
          <Ionicons name="logo-apple" size={20} color={theme.colors.textOnAction} />
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (buttonName === 'google') {
    return (
      <TouchableOpacity
        style={[styles.googleButton, disabled && styles.disabledButton]}
        onPress={onPress}
        disabled={disabled}
        accessibilityState={{ disabled }}
      >
        <View style={styles.socialButtonContent}>
          <Ionicons name="logo-google" size={20} color="#DB4437" />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (buttonName === 'email') {
    return (
      <TouchableOpacity style={styles.emailButton} onPress={onPress}>
        <View style={styles.socialButtonContent}>
          <Ionicons name="mail" size={20} color={theme.colors.textOnAction} />
          <Text style={styles.emailButtonText}>Continue with email</Text>
        </View>
      </TouchableOpacity>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  emailButton: {
    backgroundColor: theme.colors.primaryAction,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    color: theme.colors.textOnAction,
    fontSize: 16,
    fontWeight: '600',
  },
  socialButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  facebookButton: {
    backgroundColor: '#1877F2',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  facebookButtonText: {
    color: theme.colors.textOnAction,
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  googleButtonText: {
    color: theme.colors.textStrong,
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: theme.colors.text,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  appleButtonText: {
    color: theme.colors.textOnAction,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.4,
  },
});

export default SocialMediaButtons;
