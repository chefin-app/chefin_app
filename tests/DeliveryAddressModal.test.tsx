import { render, screen } from '@testing-library/react-native';

import { DeliveryAddressModal } from '@/src/components/delivery/DeliveryAddressModal';

jest.mock('expo-location', () => ({}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

describe('DeliveryAddressModal', () => {
  it('collects unit and street separately without a neighbourhood field', () => {
    render(
      <DeliveryAddressModal visible initialAddress={null} onClose={jest.fn()} onSave={jest.fn()} />
    );

    expect(screen.getByText('Street address')).toBeTruthy();
    expect(screen.getByText('Unit number (optional)')).toBeTruthy();
    expect(screen.queryByText(/neighbourhood/i)).toBeNull();
  });
});
