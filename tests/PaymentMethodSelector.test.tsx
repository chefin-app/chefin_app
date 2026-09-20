import { fireEvent, render, screen } from '@testing-library/react-native';
import PaymentMethodSelector from '@/src/components/cart/PaymentMethodSelector';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('cart payment methods', () => {
  const props = {
    qrAvailable: true,
    collectionAvailable: true,
    loading: false,
    error: '',
    disabled: false,
    value: 'cook_qr' as const,
    acknowledged: false,
    onSelect: jest.fn(),
    onAcknowledge: jest.fn(),
    onRetry: jest.fn(),
  };
  beforeEach(() => jest.clearAllMocks());

  it('shows cards as coming soon without allowing an unpaid card checkout', () => {
    render(<PaymentMethodSelector {...props} />);
    fireEvent.press(screen.getByText('See all'));
    const card = screen.getByRole('button', { name: 'Debit / credit card. Coming soon' });
    expect(card.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(card);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(screen.getByText('Payment Methods')).toBeTruthy();
  });

  it('opens the method picker and returns to the summary after selection', () => {
    render(<PaymentMethodSelector {...props} />);
    expect(screen.queryByText('Payment Methods')).toBeNull();
    fireEvent.press(screen.getByText('See all'));
    expect(screen.getByText('Payment Methods')).toBeTruthy();
    fireEvent.press(screen.getByRole('radio', { name: /Pay on collection/ }));
    expect(props.onSelect).toHaveBeenCalledWith('pay_on_collection');
    expect(screen.queryByText('Payment Methods')).toBeNull();
  });

  it('does not offer collection payment for delivery', () => {
    render(<PaymentMethodSelector {...props} collectionAvailable={false} />);
    fireEvent.press(screen.getByText('See all'));
    expect(screen.queryByText('Pay on collection')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});
