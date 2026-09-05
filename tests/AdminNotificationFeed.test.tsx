import { fireEvent, render, screen } from '@testing-library/react-native';

import type { AdminActivityItem } from '@/src/admin/types';
import AdminNotificationFeed from '@/src/components/admin/AdminNotificationFeed';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const reportNotification: AdminActivityItem = {
  id: 'report-report-id',
  type: 'report',
  title: 'Nasi Lemak was reported',
  body: 'food safety',
  createdAt: '2026-09-05T08:00:00.000Z',
  unread: true,
  deepLink: {
    pathname: '/admin/moderation',
    params: { reportId: 'report-id' },
  },
};

describe('AdminNotificationFeed deep links', () => {
  it('passes the complete notification destination when an item is pressed', () => {
    const onPress = jest.fn();

    render(
      <AdminNotificationFeed
        items={[reportNotification]}
        readIds={new Set()}
        loading={false}
        width={400}
        onPress={onPress}
        onMarkAllRead={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Nasi Lemak was reported'));

    expect(onPress).toHaveBeenCalledWith(reportNotification);
    expect(reportNotification.deepLink).toEqual({
      pathname: '/admin/moderation',
      params: { reportId: 'report-id' },
    });
  });
});
