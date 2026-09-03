import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import EmailLoginScreen from '@/app/(auth)/email-login';
import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/src/services/auth-context', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/src/utils/supabaseClient', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('email account password validation', () => {
  const signUp = jest.fn();
  const signIn = jest.fn();
  const resetPassword = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      signUp,
      signIn,
      resetPassword,
      loading: false,
    });
    signUp.mockResolvedValue({ error: null, userExists: false });
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null } });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ exists: false }),
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function openCreatePasswordStep() {
    render(<EmailLoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'new@example.com');
    fireEvent.press(screen.getByTestId('continue-button'));
    await screen.findByPlaceholderText('Create a password');
  }

  it('shows prominent red inline errors after an invalid create-account attempt', async () => {
    await openCreatePasswordStep();

    expect(screen.queryByTestId('password-validation-error')).toBeNull();
    // On a device, tapping the button blurs the focused field before onPress.
    // The old implementation disabled the button during that blur, swallowing the tap.
    fireEvent(screen.getByPlaceholderText('Create a password'), 'blur');
    fireEvent.press(screen.getByTestId('create-account-button'));

    expect(screen.getByTestId('password-validation-error')).toBeTruthy();
    expect(screen.getByText('Password requirements not met')).toBeTruthy();
    expect(screen.getByText('• At least 8 characters')).toBeTruthy();
    expect(screen.getByText('• At least one uppercase letter')).toBeTruthy();
    expect(screen.getByText('• At least one number')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('keeps uppercase and number mandatory and submits after all checks pass', async () => {
    await openCreatePasswordStep();

    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'password1');
    fireEvent.press(screen.getByTestId('create-account-button'));

    expect(screen.getByText('• At least one uppercase letter')).toBeTruthy();
    expect(signUp).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Create a password'), 'Password1');
    expect(screen.queryByTestId('password-validation-error')).toBeNull();
    fireEvent.press(screen.getByTestId('create-account-button'));

    await waitFor(() => expect(signUp).toHaveBeenCalledWith('new@example.com', 'Password1'));
  });
});
