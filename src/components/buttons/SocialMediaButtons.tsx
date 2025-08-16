import { StyleSheet, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type SocialButtonName = 'facebook' | 'apple' | 'google' | 'email';
type SocialMediaButtonsProps = {
  buttonName: SocialButtonName;
  onPress?: () => void;
};
const SocialMediaButtons: React.FC<SocialMediaButtonsProps> = ({ buttonName, onPress }) => {
  if (buttonName === 'facebook') {
    return (
      <TouchableOpacity style={styles.facebookButton} onPress={onPress}>
        <View style={styles.socialButtonContent}>
          <Ionicons name="logo-facebook" size={20} color="#fff" />
          <Text style={styles.facebookButtonText}>Continue with Facebook</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (buttonName === 'apple') {
    return (
      <TouchableOpacity style={styles.appleButton} onPress={onPress}>
        <View style={styles.socialButtonContent}>
          <Ionicons name="logo-apple" size={20} color="#fff" />
          <Text style={styles.appleButtonText}>Continue with Appple</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (buttonName === 'google') {
    return (
      <TouchableOpacity style={styles.googleButton} onPress={onPress}>
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
          <Ionicons name="mail" size={20} color="#fff" />
          <Text style={styles.emailButtonText}>Continue with email</Text>
        </View>
      </TouchableOpacity>
    );
  }
  return null;
};

const styles = StyleSheet.create({
  emailButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emailButtonText: {
    color: '#fff',
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
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  appleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SocialMediaButtons;
