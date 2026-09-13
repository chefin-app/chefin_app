import BuyerNotificationCenter from '@/src/components/notifications/BuyerNotificationCenter';

/** Customer-only notification centre. Cook notifications live in the cook Inbox tab. */
export default function BuyerNotificationsScreen() {
  return <BuyerNotificationCenter showBackButton />;
}
