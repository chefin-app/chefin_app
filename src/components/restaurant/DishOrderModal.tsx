import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { images } from '@/src/constants/images';
import type { CartSelectedOption, MenuOptionGroup } from '@/src/types/menuOptions';
import {
  areOptionSelectionsValid,
  getOptionSurcharge,
  getSelectedOptions,
  type MenuOptionSelectionState,
} from '@/src/utils/menuOptions';
import MenuOptionSelector from './MenuOptionSelector';

export interface DishOrderItem {
  id: string;
  title: string;
  price: number;
  description?: string | null;
  ingredients?: string[] | null;
  imageUrl?: string | null;
  optionGroups?: MenuOptionGroup[];
}

export interface DishOrderAddPayload {
  quantity: number;
  note: string;
  selectedOptions: CartSelectedOption[];
  unitPrice: number;
}

interface DishOrderModalProps {
  visible: boolean;
  dish: DishOrderItem | null;
  scheduleLabel: string;
  maxQuantity?: number;
  onAdd: (payload: DishOrderAddPayload) => void;
  onClose: () => void;
  onShare?: () => void | Promise<void>;
}

const DEFAULT_MAX_QUANTITY = 99;

export default function DishOrderModal({
  visible,
  dish,
  scheduleLabel,
  maxQuantity = DEFAULT_MAX_QUANTITY,
  onAdd,
  onClose,
  onShare,
}: DishOrderModalProps) {
  const safeMaximum = Math.max(0, Math.floor(maxQuantity));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<MenuOptionSelectionState>({});

  useEffect(() => {
    if (visible) {
      setQuantity(Math.min(1, safeMaximum));
      setNote('');
      setSelectedOptionIds({});
    }
  }, [dish?.id, safeMaximum, visible]);

  useEffect(() => {
    setQuantity(current => Math.min(current, safeMaximum));
  }, [safeMaximum]);

  const optionGroups = useMemo(() => dish?.optionGroups ?? [], [dish?.optionGroups]);
  const ingredients = useMemo(
    () =>
      (dish?.ingredients ?? [])
        .map(ingredient => ingredient.trim())
        .filter(ingredient => ingredient.length > 0),
    [dish?.ingredients]
  );
  const selectedOptions = useMemo(
    () => getSelectedOptions(optionGroups, selectedOptionIds),
    [optionGroups, selectedOptionIds]
  );
  const unitPrice = (dish?.price ?? 0) + getOptionSurcharge(selectedOptions);
  const total = unitPrice * quantity;
  const choicesValid = areOptionSelectionsValid(optionGroups, selectedOptionIds);
  const canAdd = Boolean(dish && safeMaximum > 0 && quantity > 0 && choicesValid);

  const handleShare = () => {
    if (!dish) return;
    if (onShare) {
      Promise.resolve(onShare()).catch(() => undefined);
      return;
    }
    Share.share({
      title: dish.title,
      message: `Check out ${dish.title} on Chefin.`,
    }).catch(() => undefined);
  };

  if (!dish) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topSafeArea} accessibilityViewIsModal>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.hero}>
              <Image
                source={dish.imageUrl ? { uri: dish.imageUrl } : images.templateMeal}
                style={styles.heroImage}
                resizeMode="cover"
                accessibilityLabel={`Photo of ${dish.title}`}
              />
              <View style={styles.heroShade} />
              <TouchableOpacity
                testID="dish-order-close"
                style={[styles.heroButton, styles.closeButton]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close dish details"
              >
                <Ionicons name="close" size={28} color="#1F2923" />
              </TouchableOpacity>
              <TouchableOpacity
                testID="dish-order-share"
                style={[styles.heroButton, styles.shareButton]}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel={`Share ${dish.title}`}
              >
                <Ionicons name="share-social-outline" size={25} color="#1F2923" />
              </TouchableOpacity>
            </View>

            <View style={styles.details}>
              <View style={styles.titleRow}>
                <Text style={styles.title} accessibilityRole="header">
                  {dish.title}
                </Text>
                <Text style={styles.price}>RM {dish.price.toFixed(2)}</Text>
              </View>
              {dish.description ? <Text style={styles.description}>{dish.description}</Text> : null}

              {ingredients.length > 0 ? (
                <View style={styles.ingredientsSection}>
                  <Text style={styles.ingredientsTitle}>Ingredients</Text>
                  <View style={styles.ingredientsList}>
                    {ingredients.map((ingredient, index) => (
                      <View
                        key={`${ingredient}-${index}`}
                        style={styles.ingredientRow}
                        accessible
                        accessibilityLabel={ingredient}
                      >
                        <View style={styles.ingredientBullet} />
                        <Text style={styles.ingredientText}>{ingredient}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View
                style={styles.scheduleSummary}
                accessible
                accessibilityLabel={`Order time: ${scheduleLabel}`}
              >
                <View style={styles.scheduleIcon}>
                  <Ionicons name="time-outline" size={18} color="#267A3E" />
                </View>
                <View style={styles.scheduleTextContainer}>
                  <Text style={styles.scheduleEyebrow}>ORDER TIME</Text>
                  <Text style={styles.scheduleText}>{scheduleLabel}</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <MenuOptionSelector
              groups={optionGroups}
              selected={selectedOptionIds}
              onChange={setSelectedOptionIds}
            />

            <View style={styles.noteSection}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Note to cook</Text>
                <View style={styles.optionalBadge}>
                  <Text style={styles.optionalText}>Optional</Text>
                </View>
              </View>
              <TextInput
                testID="dish-order-note"
                value={note}
                onChangeText={setNote}
                style={styles.noteInput}
                placeholder="Add your request (subject to the cook's discretion)"
                placeholderTextColor="#9AA29D"
                multiline
                submitBehavior="newline"
                maxLength={500}
                textAlignVertical="top"
                accessibilityLabel="Note to cook"
              />
              <Text style={styles.characterCount}>{note.length}/500</Text>
            </View>

            <View style={styles.quantitySection}>
              <Text style={styles.quantityTitle}>Quantity</Text>
              <View style={styles.quantityRow}>
                <TouchableOpacity
                  testID="dish-order-decrease"
                  style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
                  onPress={() => setQuantity(current => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  accessibilityState={{ disabled: quantity <= 1 }}
                >
                  <Ionicons name="remove" size={25} color={quantity <= 1 ? '#AEB6B0' : '#278C43'} />
                </TouchableOpacity>
                <Text
                  testID="dish-order-quantity"
                  style={styles.quantityValue}
                  accessibilityLabel={`Quantity ${quantity}`}
                >
                  {quantity}
                </Text>
                <TouchableOpacity
                  testID="dish-order-increase"
                  style={[
                    styles.quantityButton,
                    styles.quantityButtonAdd,
                    quantity >= safeMaximum && styles.quantityButtonDisabled,
                  ]}
                  onPress={() => setQuantity(current => Math.min(safeMaximum, current + 1))}
                  disabled={quantity >= safeMaximum}
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  accessibilityState={{ disabled: quantity >= safeMaximum }}
                >
                  <Ionicons
                    name="add"
                    size={25}
                    color={quantity >= safeMaximum ? '#AEB6B0' : '#FFFFFF'}
                  />
                </TouchableOpacity>
              </View>
              {safeMaximum > 0 && safeMaximum < DEFAULT_MAX_QUANTITY ? (
                <Text style={styles.capacityText}>
                  {safeMaximum} order{safeMaximum === 1 ? '' : 's'} left for this time
                </Text>
              ) : null}
              {safeMaximum === 0 ? (
                <Text style={styles.soldOutText}>
                  This dish is no longer available for this time.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>

        <SafeAreaView edges={['bottom']} style={styles.footerSafeArea}>
          <View style={styles.footer}>
            <TouchableOpacity
              testID="dish-order-add"
              style={[styles.addButton, !canAdd && styles.addButtonDisabled]}
              onPress={() => onAdd({ quantity, note: note.trim(), selectedOptions, unitPrice })}
              disabled={!canAdd}
              accessibilityRole="button"
              accessibilityLabel={
                canAdd
                  ? `Add ${quantity} ${quantity === 1 ? 'item' : 'items'} to basket for RM ${total.toFixed(2)}`
                  : !choicesValid
                    ? 'Complete the required option selections'
                    : 'Dish unavailable for selected time'
              }
              accessibilityState={{ disabled: !canAdd }}
            >
              <Text style={[styles.addButtonText, !canAdd && styles.addButtonTextDisabled]}>
                {canAdd
                  ? `Add to basket · RM ${total.toFixed(2)}`
                  : !choicesValid
                    ? 'Complete required selections'
                    : 'Unavailable for this time'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topSafeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  hero: { height: 205, backgroundColor: '#E9ECEA' },
  heroImage: { width: '100%', height: '100%' },
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 22, 18, 0.08)',
  },
  heroButton: {
    position: 'absolute',
    top: 18,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    elevation: 5,
  },
  closeButton: { left: 18, marginTop: 50 },
  shareButton: { right: 18, marginTop: 50 },
  details: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  title: {
    flex: 1,
    fontFamily: 'mon-b',
    fontSize: 22,
    lineHeight: 33,
    color: '#1F2622',
  },
  price: {
    paddingTop: 2,
    fontFamily: 'mon-b',
    fontSize: 21,
    color: '#1F2622',
  },
  description: {
    marginTop: 14,
    fontFamily: 'mon',
    fontSize: 15,
    lineHeight: 23,
    color: '#69726C',
  },
  ingredientsSection: { marginTop: 20 },
  ingredientsTitle: {
    marginBottom: 10,
    fontFamily: 'mon-sb',
    fontSize: 15,
    color: '#303A34',
  },
  ingredientsList: { gap: 7 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start' },
  ingredientBullet: {
    width: 5,
    height: 5,
    marginTop: 8,
    marginRight: 10,
    borderRadius: 3,
    backgroundColor: '#35A853',
  },
  ingredientText: {
    flex: 1,
    fontFamily: 'mon',
    fontSize: 14,
    lineHeight: 21,
    color: '#5E6962',
  },
  scheduleSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#EFF8F1',
  },
  scheduleIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderRadius: 17,
    backgroundColor: '#DDF1E2',
  },
  scheduleTextContainer: { flex: 1 },
  scheduleEyebrow: {
    marginBottom: 2,
    fontFamily: 'mon-b',
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#5D7463',
  },
  scheduleText: {
    fontFamily: 'mon-sb',
    fontSize: 13,
    lineHeight: 18,
    color: '#2E583A',
  },
  divider: { height: 9, backgroundColor: '#F4F6F4' },
  noteSection: { paddingHorizontal: 22, paddingTop: 24 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'mon-b',
    fontSize: 20,
    color: '#222A25',
  },
  optionalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F1F3F1',
  },
  optionalText: { fontFamily: 'mon-sb', fontSize: 11, color: '#667069' },
  noteInput: {
    minHeight: 124,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 15,
    borderWidth: 1,
    borderColor: '#D6DBD7',
    borderRadius: 16,
    fontFamily: 'mon',
    fontSize: 14,
    lineHeight: 21,
    color: '#2B342E',
    backgroundColor: '#FFFFFF',
  },
  characterCount: {
    marginTop: 6,
    alignSelf: 'flex-end',
    fontFamily: 'mon',
    fontSize: 10,
    color: '#929A94',
  },
  quantitySection: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 23 },
  quantityTitle: {
    marginBottom: 14,
    fontFamily: 'mon-sb',
    fontSize: 14,
    color: '#4C5650',
  },
  quantityRow: { flexDirection: 'row', alignItems: 'center' },
  quantityButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: '#E5F6E9',
  },
  quantityButtonAdd: { backgroundColor: '#35B958' },
  quantityButtonDisabled: { backgroundColor: '#F0F2F0' },
  quantityValue: {
    minWidth: 74,
    textAlign: 'center',
    fontFamily: 'mon-b',
    fontSize: 20,
    color: '#222A25',
  },
  capacityText: {
    marginTop: 9,
    fontFamily: 'mon',
    fontSize: 11,
    color: '#77817A',
  },
  soldOutText: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: 'mon-sb',
    fontSize: 12,
    lineHeight: 18,
    color: '#B42318',
  },
  footerSafeArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E4E8E5',
    backgroundColor: '#FFFFFF',
  },
  footer: { paddingHorizontal: 18, paddingTop: 13, paddingBottom: 10 },
  addButton: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: '#35B958',
  },
  addButtonDisabled: { backgroundColor: '#E8EBE9' },
  addButtonText: {
    fontFamily: 'mon-b',
    fontSize: 16,
    color: '#FFFFFF',
  },
  addButtonTextDisabled: { color: '#959D97' },
});
