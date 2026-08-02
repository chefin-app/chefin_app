import { Stack } from 'expo-router';
import { AdminAuthProvider } from '@/src/admin/AdminAuthContext';

export default function AdminLayout() {
  return (
    <AdminAuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminAuthProvider>
  );
}
