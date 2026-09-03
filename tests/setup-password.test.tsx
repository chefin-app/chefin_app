import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SetupPasswordStep3 from '@/app/(auth)/setup-password';
import { useAuth } from '@/src/services/auth-context';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/src/services/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('create password validation', () => {
  const updatePassword = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    updatePassword.mockResolvedValue({ error: null });
    (useAuth as jest.Mock).mockReturnValue({
      updatePassword,
      onboardingCompleted: false,
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a prominent inline summary after an invalid submission', () => {
    render(<SetupPasswordStep3 />);

    expect(screen.queryByTestId('password-validation-error')).toBeNull();
    fireEvent.press(screen.getByText('Create Account'));

    expect(screen.getByTestId('password-validation-error')).toBeTruthy();
    expect(screen.getByText('Password requirements not met')).toBeTruthy();
    expect(screen.getByText('• Use at least 6 characters.')).toBeTruthy();
    expect(screen.getByText('• Add at least one uppercase letter.')).toBeTruthy();
    expect(screen.getByText('• Add at least one number.')).toBeTruthy();
    expect(screen.getByText('• Confirm your password.')).toBeTruthy();
    expect(screen.getByText('Confirm your password.')).toBeTruthy();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('shows a dedicated mismatch error and submits only after correction', async () => {
    render(<SetupPasswordStep3 />);

    fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'Password1');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm your password'), 'Password2');
    fireEvent.press(screen.getByText('Create Account'));

    expect(screen.getByText('Passwords do not match. Try again.')).toBeTruthy();
    expect(screen.getByText('• Make sure both passwords match.')).toBeTruthy();
    expect(updatePassword).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Confirm your password'), 'Password1');
    fireEvent.press(screen.getByText('Create Account'));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('Password1'));
  });
});
