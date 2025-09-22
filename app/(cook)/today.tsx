import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { User } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';

interface Order {
  id: string;
  customer_name: string;
  status: 'new' | 'preparing' | 'ready';
  pickup_time?: string;
  created_at: string;
  items: any[];
  total_amount: number;
}

type OrderStatus = 'new' | 'preparing' | 'ready';

const Today: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<OrderStatus>('new');
  const [loading, setLoading] = useState(false);
  const [isChefSetupComplete, setIsChefSetupComplete] = useState(true);

  // Get user info on component mount
  useEffect(() => {
    getCurrentUser();
  }, []);

  // Fetch orders when active tab changes
  useEffect(() => {
    fetchOrders(activeTab);
  }, [activeTab]);

  const getCurrentUser = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/auth/session');
      if (!res.ok) {
        throw new Error('Failed to fetch session');
      }
      const data = await res.json();
      setUser(data.session?.user ?? null);
    } catch (error) {
      console.error('Error fetching user session:', error);
    }
  };

  const fetchOrders = async (status: OrderStatus) => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/auth/session');
      if (!res.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await res.json();
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getOrderCount = (status: OrderStatus): number => {
    console.log('ORDERS:', orders);
    return orders.filter(order => order.status === status).length;
  };

  const getUserDisplayName = (): string => {
    if (!user) return 'Chef';
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Chef'
    );
  };

  const handleFinishSetup = () => {
    // Navigate to setup completion or handle setup logic
    console.log('Finish setting up Chefin');
    setIsChefSetupComplete(true);
  };

  const renderOrderButton = (status: OrderStatus, label: string) => {
    const count = getOrderCount(status);
    const isActive = activeTab === status;

    return (
      <TouchableOpacity
        style={[styles.orderButton, isActive && styles.activeOrderButton]}
        onPress={() => setActiveTab(status)}
      >
        <Text
          style={[styles.orderButtonText, isActive && styles.activeOrderButtonText]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label} ({count})
        </Text>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <View style={styles.checkIcon}>
        <Text style={styles.checkIconText}>✓</Text>
      </View>
      <Text style={styles.emptyStateText}>
        You don't have any customers ordering today or tomorrow
      </Text>
    </View>
  );

  const renderOrdersList = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      );
    }

    if (orders.length === 0) {
      return renderEmptyState();
    }

    return (
      <ScrollView style={styles.ordersList}>
        {orders.map(order => (
          <View key={order.id} style={styles.orderItem}>
            <Text style={styles.orderCustomer}>{order.customer_name}</Text>
            <Text style={styles.orderDetails}>
              ${order.total_amount.toFixed(2)} • {order.items?.length || 0} items
            </Text>
            {order.pickup_time && (
              <Text style={styles.orderTime}>
                Pickup: {new Date(order.pickup_time).toLocaleTimeString()}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => console.log('Open notifications')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="notifications-outline" size={24} color="#000" />
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>3</Text>
            </View>
          </TouchableOpacity>
        </View>
        <Text style={styles.welcomeText}>Welcome, Chef {getUserDisplayName()}!</Text>

        {!isChefSetupComplete && (
          <TouchableOpacity style={styles.setupButton} onPress={handleFinishSetup}>
            <Text style={styles.setupButtonText}>Finish setting up your Chefin</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Your orders</Text>

        <View style={styles.orderButtonsContainer}>
          <View style={styles.orderButtonsRow}>
            {renderOrderButton('new', 'New orders')}
            {renderOrderButton('preparing', 'Preparing today')}
            {renderOrderButton('ready', 'Ready for pickup')}
          </View>
        </View>

        <View style={styles.ordersContainer}>{renderOrdersList()}</View>

        <View style={styles.allOrdersContainer}>
          <TouchableOpacity style={styles.allOrdersButton}>
            <Text style={styles.allOrdersText}>All orders (0)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 30,
  },

  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end', // push bell to right
    marginBottom: 10, // space between bell and Welcome
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 15,
  },
  setupButton: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignSelf: 'flex-start',
  },
  setupButtonText: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 15,
    marginTop: 10,
  },
  orderButtonsContainer: {
    marginBottom: 20,
  },
  orderButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  orderButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 3,
    borderRadius: 20,
    borderColor: '#000000', // must be in quotes
    borderWidth: 1, // thin border
    backgroundColor: '#F8F8F8',
    marginHorizontal: 4,
    alignItems: 'center',
  },

  activeOrderButton: {
    backgroundColor: '#4CAF50',
  },
  orderButtonText: {
    fontSize: 9,
    color: '#666666',
    fontWeight: '500',
    textAlign: 'center',
    flexShrink: 1, // allow shrinking instead of wrapping
  },
  activeOrderButtonText: {
    color: '#FFFFFF',
  },
  tooltipContainer: {
    alignItems: 'center',
  },
  tooltip: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '80%',
  },
  tooltipText: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 14,
  },
  ordersContainer: {
    backgroundColor: '#F8F8F8',
    height: 300,
    maxHeight: 400,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  checkIconText: {
    fontSize: 24,
    color: '#666666',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    maxWidth: 250,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersList: {
    flex: 1,
  },
  orderItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  orderCustomer: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 5,
  },
  orderDetails: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 5,
  },
  orderTime: {
    fontSize: 12,
    color: '#007AFF',
  },
  allOrdersContainer: {
    marginBottom: 20,
  },
  allOrdersButton: {
    paddingVertical: 12,
  },
  allOrdersText: {
    fontSize: 16,
    color: '#000000',
    textDecorationLine: 'underline',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingVertical: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTabItem: {
    opacity: 1,
  },
  tabText: {
    fontSize: 10,
    color: '#999999',
    marginTop: 2,
  },
  activeTabText: {
    fontSize: 10,
    color: '#4CAF50',
    marginTop: 2,
  },

  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative', // for the badge absolute positioning
    backgroundColor: '#F2F2F2',
  },

  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default Today;
