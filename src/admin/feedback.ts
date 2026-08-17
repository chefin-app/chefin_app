import { Alert } from 'react-native';

export const showAdminSuccess = (title: string, message: string) => {
  Alert.alert(title, message);
};

export const showAdminFailure = (
  error: unknown,
  fallback = 'The action could not be completed. Please try again.',
  title = 'Action failed'
) => {
  Alert.alert(title, error instanceof Error ? error.message : fallback);
};
