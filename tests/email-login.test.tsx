import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/src/services/auth-context';
import EmailLoginScreen from '@/src/app/(auth)/email-login';
import { Alert, DevMenu } from 'react-native';

// Mock `useAuth` hook and Alert
jest.mock('@/src/services/auth-context', () => ({
  useAuth: jest.fn(),
}));

// jest.mock('react-native', () => ({
//   ...jest.requireActual('react-native'),
//   Alert: { alert: jest.fn() },  // Mocking the alert function
// })); // not working ahh

describe('EmailLoginScreen', () => {
  let signUpMock: jest.Mock;
  let signInMock: jest.Mock;
  let resetPasswordMock: jest.Mock;

  beforeEach(() => {
    signUpMock = jest.fn();
    signInMock = jest.fn();
    resetPasswordMock = jest.fn();

    // Setup the mock return values for `useAuth`
    (useAuth as jest.Mock).mockReturnValue({
      signUp: signUpMock,
      signIn: signInMock,
      resetPassword: resetPasswordMock,
      loading: false,
    });
  });

  it('should render the EmailLoginScreen correctly', () => {
    render(<EmailLoginScreen />);

    expect(screen.getByPlaceholderText('Enter your email')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter your password')).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy(); // Default is "Sign In" button text
  });

  it('should call signUp when the user clicks the submit button in Sign Up mode', async () => {
    render(<EmailLoginScreen />);

    fireEvent.press(screen.getByText('Sign Up')); // Switch to Sign Up mode

    fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'test@example.com'); // Fill in email and password
    fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'password123');

    signUpMock.mockResolvedValue({ error: null }); // Mock `signUp` response
    fireEvent.press(screen.getByTestId('create-account-button')); // Press submit button

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('should call signIn when the user clicks the submit button in Sign In mode', async () => {
    render(<EmailLoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'test@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'password123');

    signInMock.mockResolvedValue({ error: null });

    fireEvent.press(screen.getByText('Sign In'));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  // it('should show an error alert if email or password is missing', async () => {
  //     render(<EmailLoginScreen />);

  //     fireEvent.press(screen.getByText('Sign In')); // Try to press submit without filling in fields

  //     await waitFor(() => {
  //         // expect(Alert.alert).toHaveBeenCalledWith('Error', 'Please fill in all fields');
  //     });
  // });

  it('should call resetPassword when "Forgot Password?" is pressed', async () => {
    render(<EmailLoginScreen />);

    fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'test@example.com');

    resetPasswordMock.mockResolvedValue({ error: null }); // Mock `resetPassword` response
    fireEvent.press(screen.getByText('Forgot Password?')); // Press "Forgot Password?"

    await waitFor(() => {
      expect(resetPasswordMock).toHaveBeenCalledWith('test@example.com');
      // expect(Alert.alert).toHaveBeenCalledWith('Password Reset', 'Check your email for password reset instructions');
    });
  });

  it('should toggle between Sign In and Sign Up modes', () => {
    render(<EmailLoginScreen />);

    expect(screen.getByText('Sign In')).toBeTruthy(); // Initially, the button text should be "Sign In"
    fireEvent.press(screen.getByText('Sign Up')); // Switch to Sign Up mode

    expect(screen.getByTestId('create-account-button')).toBeTruthy(); // Button text should change to "Create Account"
  });

  // it('should show an alert for failed signIn or signUp', async () => {
  //     render(<EmailLoginScreen />);

  //     signInMock.mockResolvedValue({ error: { message: 'Invalid credentials' } }); // Mock a failed login

  //     fireEvent.changeText(screen.getByPlaceholderText('Enter your email'), 'wrong@example.com'); // Fill in email and password
  //     fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'wrongpassword');

  //     fireEvent.press(screen.getByText('Sign In')); // Try to press the sign-in button

  //     // await waitFor(() => {
  //     //     expect(Alert.alert).toHaveBeenCalledWith('Error', 'Invalid credentials');
  //     // });
  // });
});
