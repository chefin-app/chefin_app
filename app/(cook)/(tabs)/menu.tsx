import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

type DishRow = {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  status: string;
};

export default function Menu() {
  const { user } = useAuth();
  const router = useRouter();
  const [threshold, setThreshold] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [dishes, setDishes] = useState<DishRow[]>([]);
  const [dishesLoading, setDishesLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('free_delivery_threshold')
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        const raw = data?.free_delivery_threshold;
        setThreshold(raw != null ? Number(raw) : null);
      } catch (e: any) {
        console.warn('Failed to load delivery threshold', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const loadDishes = useCallback(async () => {
    if (!user) {
      setDishesLoading(false);
      return;
    }
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) return;
      const { data, error } = await supabase
        .from('listings')
        .select('id, title, price, image_url, status')
        .eq('cook_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDishes(((data as DishRow[]) ?? []).map(d => ({ ...d, price: Number(d.price) })));
    } catch (e: any) {
      console.warn('Failed to load dishes', e.message);
    } finally {
      setDishesLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadDishes();
    }, [loadDishes])
  );

  const openEditor = () => {
    setDraft(threshold != null ? String(threshold) : '');
    setEditing(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(false);
    setDraft('');
  };

  const handleSave = async (clear: boolean = false) => {
    if (!user) return;
    let value: number | null = null;
    if (!clear) {
      const parsed = parseFloat(draft.replace(',', '.'));
      if (isNaN(parsed) || parsed <= 0) {
        Alert.alert('Invalid amount', 'Please enter a positive number, e.g. 30');
        return;
      }
      value = Math.round(parsed * 100) / 100;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ free_delivery_threshold: value })
        .eq('user_id', user.id);
      if (error) throw error;
      setThreshold(value);
      setEditing(false);
      setDraft('');
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Free delivery banner */}
        {loading ? (
          <View style={[styles.banner, styles.bannerCenter]}>
            <ActivityIndicator color="#4CAF50" />
          </View>
        ) : threshold != null ? (
          <TouchableOpacity style={styles.banner} onPress={openEditor} activeOpacity={0.7}>
            <View style={styles.bannerIcon}>
              <Ionicons name="bicycle" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerEyebrow}>FREE DELIVERY</Text>
              <Text style={styles.bannerTitle}>On orders over RM {threshold.toFixed(2)}</Text>
            </View>
            <Ionicons name="pencil" size={18} color="#666" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.banner, styles.bannerEmpty]}
            onPress={openEditor}
            activeOpacity={0.7}
          >
            <View style={[styles.bannerIcon, styles.bannerIconEmpty]}>
              <Ionicons name="bicycle-outline" size={22} color="#4CAF50" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Offer free delivery</Text>
              <Text style={styles.bannerSubtitle}>
                Waive delivery on larger orders to drive bigger baskets
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
        )}

        {/* Dishes list */}
        {dishesLoading ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color="#4CAF50" />
          </View>
        ) : dishes.length === 0 ? (
          <View style={styles.placeholder}>
            <Ionicons name="restaurant-outline" size={32} color="#bbb" />
            <Text style={styles.placeholderText}>
              Add your first dish with the “＋” button above.
            </Text>
          </View>
        ) : (
          <View style={styles.dishList}>
            {dishes.map(dish => {
              const isPending = dish.status === 'pending';
              const isRejected = dish.status === 'rejected';
              return (
                <TouchableOpacity
                  key={dish.id}
                  style={[styles.dishCard, (isPending || isRejected) && styles.dishCardMuted]}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push({ pathname: '/(cook)/edit-dish', params: { id: dish.id } })
                  }
                >
                  {dish.image_url ? (
                    <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
                  ) : (
                    <View style={[styles.dishImage, styles.dishImagePlaceholder]}>
                      <Ionicons name="image-outline" size={24} color="#bbb" />
                    </View>
                  )}
                  <View style={styles.dishBody}>
                    <Text style={styles.dishTitle} numberOfLines={1}>
                      {dish.title}
                    </Text>
                    <Text style={styles.dishPrice}>RM {dish.price.toFixed(2)}</Text>
                    {isPending && (
                      <View style={[styles.statusBadge, styles.statusBadgePending]}>
                        <Ionicons name="time-outline" size={12} color="#B26B00" />
                        <Text style={[styles.statusBadgeText, { color: '#B26B00' }]}>
                          Pending review
                        </Text>
                      </View>
                    )}
                    {isRejected && (
                      <View style={[styles.statusBadge, styles.statusBadgeRejected]}>
                        <Ionicons name="close-circle-outline" size={12} color="#C62828" />
                        <Text style={[styles.statusBadgeText, { color: '#C62828' }]}>Rejected</Text>
                      </View>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color="#bbb"
                    style={{ marginRight: 8 }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={editing} transparent animationType="slide" onRequestClose={closeEditor}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.modalDismiss} onPress={closeEditor} activeOpacity={1} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Free delivery</Text>
            <Text style={styles.modalSubtitle}>
              Customers pay no delivery fee when their order subtotal meets or exceeds this amount.
            </Text>

            <View style={styles.amountRow}>
              <Text style={styles.currency}>RM</Text>
              <TextInput
                style={styles.amountInput}
                value={draft}
                onChangeText={text => setDraft(text.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="30.00"
                placeholderTextColor="#bbb"
                autoFocus
                editable={!saving}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
              onPress={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {threshold != null ? 'Update threshold' : 'Save threshold'}
                </Text>
              )}
            </TouchableOpacity>

            {threshold != null && (
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => handleSave(true)}
                disabled={saving}
              >
                <Text style={styles.dangerBtnText}>Turn off free delivery</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={closeEditor} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 70,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    gap: 12,
  },
  bannerEmpty: {
    backgroundColor: '#F7F9FC',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  bannerCenter: { justifyContent: 'center', minHeight: 70 },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIconEmpty: { backgroundColor: '#E8F5E9' },
  bannerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
    letterSpacing: 1,
    marginBottom: 2,
  },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  bannerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },
  placeholder: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
    gap: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  dishList: { paddingHorizontal: 20, gap: 12 },
  dishCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    gap: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  dishCardMuted: { opacity: 0.55 },
  dishImage: { width: 72, height: 72, borderRadius: 10 },
  dishImagePlaceholder: {
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishBody: { flex: 1, gap: 4 },
  dishTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  dishPrice: { fontSize: 14, color: '#1A1A1A' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
    marginTop: 2,
  },
  statusBadgePending: { backgroundColor: '#FFF3E0' },
  statusBadgeRejected: { backgroundColor: '#FFEBEE' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalDismiss: { flex: 1 },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 18 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
    gap: 8,
  },
  currency: { fontSize: 18, fontWeight: '600', color: '#888' },
  amountInput: { flex: 1, fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  primaryBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnDisabled: { backgroundColor: '#a5d6a7' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dangerBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  dangerBtnText: { color: '#FF5252', fontSize: 14, fontWeight: '600' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#666', fontSize: 14, fontWeight: '500' },
});
