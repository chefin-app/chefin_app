/**
 * Single-screen "Start a Home Restaurant" onboarding wizard.
 *
 * Walks the cook through 9 steps under a consistent chrome (Save & exit pill,
 * progress bar, Back/Next). Nothing is written to the DB or storage until the
 * final Submit application step.
 *
 * Why this lives in one file instead of recycling /(cook)/add-dish, /(cook)/address,
 * /(cook)/food-safety and /(user)/payment-methods: those screens each have their
 * own header/back/Save-Exit treatment, and bouncing between them mid-flow
 * breaks the "single wizard" UX. This file owns the entire flow's state.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

// ── Constants ───────────────────────────────────────────────────────
const RESTAURANT_NAME_LIMIT = 40;
const TITLE_LIMIT = 32;
const DESCRIPTION_LIMIT = 200;
const INGREDIENTS_LIMIT = 500;
const MAX_DIETARY_TAGS = 4;
const DISH_IMAGES_BUCKET = 'dish-images';
const FOOD_SAFETY_BUCKET = 'food-safety-licenses';
const PAYMENT_STORAGE_KEY = '@chefin:payment-method';

const CUISINE_OPTIONS = [
  'Chinese',
  'Japanese',
  'Indian',
  'Italian',
  'Korean',
  'Western',
  'Thai',
  'Mexican',
  'Others',
];
// Nominatim (OpenStreetMap) autocomplete — free, no API key, strict 1 req/s
// limit on the public server so we debounce + abort in-flight requests.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_UA = 'ChefinApp/1.0 (https://chefin.app)';

type NominatimAddress = {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
  country?: string;
};
type NominatimResult = {
  place_id: number;
  display_name: string;
  address?: NominatimAddress;
};

const DIETARY_TAG_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Keto',
  'Organic',
  'Halal',
  'Nut-free',
  'Gluten-free',
  'Spicy',
  'Fish',
  'Shellfish',
  'Low-carb',
  'Dairy-free',
  'Healthy',
  'Comfort food',
  'Snacks',
  'Breakfast',
  'Lunch',
  'Dinner',
  'Desserts',
  'Drinks',
  'Pastry',
];

type Step =
  | 'restaurant'
  | 'photo'
  | 'title'
  | 'description'
  | 'ingredients'
  | 'keywords'
  | 'price'
  | 'address'
  | 'food-safety'
  | 'payment';

const STEPS: Step[] = [
  'restaurant',
  'photo',
  'title',
  'description',
  'ingredients',
  'keywords',
  'price',
  'address',
  'food-safety',
  'payment',
];

const STEP_HEADINGS: Record<Step, { title: string; subtitle: string }> = {
  restaurant: {
    title: "What's your home restaurant called?",
    subtitle: 'Customers will see this name on every listing you publish.',
  },
  photo: {
    title: 'Add a photo of your dish',
    subtitle: 'A clear photo helps your dish stand out.',
  },
  title: {
    title: "Now, let's give your dish a title",
    subtitle: 'Short titles work best. You can always change it later.',
  },
  description: {
    title: 'Next, create a description',
    subtitle: 'Make it catchy and appealing — you can always change it later.',
  },
  ingredients: {
    title: 'List your ingredients',
    subtitle: 'Help diners with allergies and preferences. One ingredient per line.',
  },
  keywords: {
    title: 'Choose your keywords',
    subtitle: 'Pick 1 cuisine that fits your dish, plus up to 4 tags.',
  },
  price: {
    title: 'Now, set a base price',
    subtitle: 'You can change this anytime.',
  },
  address: {
    title: 'Where will customers pick up from?',
    subtitle: 'Your exact address is only shared after a customer places an order.',
  },
  'food-safety': {
    title: 'Share food safety details',
    subtitle: '',
  },
  payment: {
    title: 'Add a payment method',
    subtitle: 'Payment will be credited to your account once your order is completed.',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
const formatCardNumber = (digits: string): string => digits.replace(/(.{4})/g, '$1 ').trim();
const formatExpiry = (digits: string): string =>
  digits.length >= 3 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
const detectBrand = (digits: string): string => {
  if (/^4/.test(digits)) return 'Visa';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(digits)) return 'Mastercard';
  if (/^6(011|5|4[4-9])/.test(digits)) return 'Discover';
  return digits.length > 0 ? 'Card' : '';
};
const luhnValid = (digits: string): boolean => {
  if (digits.length < 13) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

// ── Component ───────────────────────────────────────────────────────
export default function StartRestaurantWizard() {
  const router = useRouter();
  const { user } = useAuth();

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  const [submitting, setSubmitting] = useState(false);

  // Restaurant step
  const [restaurantName, setRestaurantName] = useState('');

  // Dish steps
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [priceText, setPriceText] = useState('5');
  const ingredientsList = ingredientsText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

  // Address step
  const [addr, setAddr] = useState({
    country: '',
    flat: '',
    property_name: '',
    street: '',
    locality: '',
    town: '',
    postcode: '',
  });
  // Nominatim autocomplete (debounced lookup, cancellable)
  const [addrSearchQuery, setAddrSearchQuery] = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState<NominatimResult[]>([]);
  const [addrSearching, setAddrSearching] = useState(false);
  const addrAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = addrSearchQuery.trim();
    if (q.length < 3) {
      setAddrSuggestions([]);
      setAddrSearching(false);
      return;
    }
    const handle = setTimeout(async () => {
      addrAbortRef.current?.abort();
      const controller = new AbortController();
      addrAbortRef.current = controller;
      setAddrSearching(true);
      try {
        const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5`;
        const res = await fetch(url, {
          headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data: NominatimResult[] = await res.json();
        setAddrSuggestions(data);
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('Nominatim error', e.message);
          setAddrSuggestions([]);
        }
      } finally {
        setAddrSearching(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [addrSearchQuery]);

  const selectAddrSuggestion = (s: NominatimResult) => {
    const a = s.address ?? {};
    const streetParts = [a.house_number, a.road ?? a.pedestrian].filter(Boolean);
    setAddr(prev => ({
      ...prev,
      country: a.country ?? prev.country,
      street: streetParts.join(' ') || prev.street,
      locality: a.suburb ?? a.neighbourhood ?? a.quarter ?? prev.locality,
      town: a.city ?? a.town ?? a.village ?? prev.town,
      postcode: a.postcode ?? prev.postcode,
    }));
    setAddrSearchQuery('');
    setAddrSuggestions([]);
  };

  // Food safety step
  const [hostingType, setHostingType] = useState<'private' | 'business' | null>(null);
  const [licenseAnswer, setLicenseAnswer] = useState<'yes' | 'no' | null>(null);
  const [licenseAsset, setLicenseAsset] = useState<{
    uri: string;
    mime: string;
    name: string;
    isPdf: boolean;
  } | null>(null);

  // Payment step
  const [cardDigits, setCardDigits] = useState('');
  const [expDigits, setExpDigits] = useState('');
  const [cvcDigits, setCvcDigits] = useState('');
  const cardRef = useRef<TextInput>(null);
  const expRef = useRef<TextInput>(null);
  const cvcRef = useRef<TextInput>(null);

  // ── Step validation ──────────────────────────────────────────────
  const canAdvance = (): boolean => {
    switch (step) {
      case 'restaurant':
        return restaurantName.trim().length > 0;
      case 'photo':
        return photoUri != null;
      case 'title':
        return title.trim().length > 0;
      case 'description':
        return description.trim().length > 0;
      case 'ingredients':
        return ingredientsList.length > 0;
      case 'keywords':
        return cuisine != null;
      case 'price':
        return priceNum > 0;
      case 'address':
        return (
          addr.country.trim() !== '' &&
          addr.street.trim() !== '' &&
          addr.town.trim() !== '' &&
          addr.postcode.trim() !== ''
        );
      case 'food-safety':
        return hostingType != null && licenseAnswer != null;
      case 'payment':
        return cardDigits.length === 16 && expDigits.length === 4 && cvcDigits.length === 3;
    }
  };

  // ── Step actions ─────────────────────────────────────────────────
  const handleSaveExit = () => {
    Alert.alert('Discard application?', 'Your progress will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const handleBack = () => {
    if (stepIdx === 0) {
      handleSaveExit();
      return;
    }
    setStepIdx(stepIdx - 1);
  };

  const handleNext = async () => {
    if (!canAdvance() || submitting) return;
    // Special: food-safety with "yes, I have a license" but no upload
    if (step === 'food-safety' && licenseAnswer === 'yes' && !licenseAsset) {
      Alert.alert(
        'Upload your license',
        'Please upload a copy of your food safety license to continue, or pick "No, I don\'t have one".'
      );
      return;
    }
    // Special: payment step → final commit
    if (step === 'payment') {
      const err = validateCard();
      if (err) {
        Alert.alert('Check your card details', err);
        return;
      }
      await submit();
      return;
    }
    setStepIdx(stepIdx + 1);
  };

  const validateCard = (): string | null => {
    if (!luhnValid(cardDigits)) return 'That card number doesn’t look right.';
    const mm = parseInt(expDigits.slice(0, 2), 10);
    const yy = parseInt(expDigits.slice(2), 10);
    if (mm < 1 || mm > 12) return 'Expiry month must be 01–12.';
    const now = new Date();
    const expEndOfMonth = new Date(2000 + yy, mm, 0);
    if (expEndOfMonth < new Date(now.getFullYear(), now.getMonth(), 1)) {
      return 'This card has expired.';
    }
    return null;
  };

  // ── Photo picker ─────────────────────────────────────────────────
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  // ── License document picker ──────────────────────────────────────
  const pickLicense = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.name?.split('.').pop() ?? asset.uri.split('.').pop() ?? 'pdf').toLowerCase();
    const mime =
      asset.mimeType ??
      (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    setLicenseAsset({
      uri: asset.uri,
      mime,
      name: asset.name ?? `license.${ext}`,
      isPdf: ext === 'pdf',
    });
  };

  // ── Card input handlers ──────────────────────────────────────────
  const onCardChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 16);
    setCardDigits(digits);
    if (digits.length === 16) expRef.current?.focus();
  };
  const onExpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    setExpDigits(digits);
    if (digits.length === 4) cvcRef.current?.focus();
  };
  const onCvcChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 3);
    setCvcDigits(digits);
    if (digits.length === 3) cvcRef.current?.blur();
  };

  // ── Toggle helpers ───────────────────────────────────────────────
  const toggleCuisine = (kw: string) => setCuisine(prev => (prev === kw ? null : kw));
  const toggleDietaryTag = (kw: string) => {
    setDietaryTags(prev => {
      if (prev.includes(kw)) return prev.filter(k => k !== kw);
      if (prev.length >= MAX_DIETARY_TAGS) return prev;
      return [...prev, kw];
    });
  };
  const adjustPrice = (delta: number) => {
    const next = Math.max(0, Math.round((priceNum + delta) * 100) / 100);
    setPriceText(String(next));
  };

  // ── Final commit ─────────────────────────────────────────────────
  const submit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to submit your application.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileErr || !profile) throw new Error('Profile not found for your account.');

      // 1. Upload dish photo
      let dishImageUrl: string | null = null;
      if (photoUri) {
        const ext = (photoUri.split('.').pop() || 'jpg').toLowerCase();
        const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const path = `${profile.id}/${Date.now()}.${ext}`;
        const response = await fetch(photoUri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from(DISH_IMAGES_BUCKET)
          .upload(path, arrayBuffer, { contentType, upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: pub } = supabase.storage.from(DISH_IMAGES_BUCKET).getPublicUrl(path);
        dishImageUrl = pub.publicUrl;
      }

      // 2. Insert listing
      const { error: insertErr } = await supabase.from('listings').insert({
        cook_id: profile.id,
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        image_url: dishImageUrl,
        cuisine,
        dietary_tags: dietaryTags,
        ingredients: ingredientsList,
        location: addr.locality.trim() || null,
        is_active: true,
      });
      if (insertErr) throw insertErr;

      // 3. Upload license (if any)
      let licensePath: string | null = null;
      if (licenseAnswer === 'yes' && licenseAsset) {
        const ext = licenseAsset.name.split('.').pop()?.toLowerCase() ?? 'pdf';
        const path = `${user.id}/license-${Date.now()}.${ext}`;
        const response = await fetch(licenseAsset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from(FOOD_SAFETY_BUCKET)
          .upload(path, arrayBuffer, { contentType: licenseAsset.mime, upsert: false });
        if (uploadErr) throw uploadErr;
        licensePath = path;
      }

      // 4. Update profile (address + food safety)
      const { error: profileUpdateErr } = await supabase
        .from('profiles')
        .update({
          address_country: addr.country.trim(),
          address_flat: addr.flat.trim() || null,
          address_property_name: addr.property_name.trim() || null,
          address_street: addr.street.trim(),
          address_locality: addr.locality.trim() || null,
          address_town: addr.town.trim(),
          address_postcode: addr.postcode.trim(),
          hosting_type: hostingType,
          has_food_safety_license: licenseAnswer === 'yes',
          food_safety_license_url: licensePath,
        })
        .eq('user_id', user.id);
      if (profileUpdateErr) throw profileUpdateErr;

      // 5. Save card locally
      const card = {
        brand: detectBrand(cardDigits),
        last4: cardDigits.slice(-4),
        expMonth: expDigits.slice(0, 2),
        expYear: expDigits.slice(2),
      };
      await AsyncStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(card));

      Alert.alert(
        'Application submitted!',
        "Welcome to your cook dashboard. Your dish is pending admin review — customers won't see it on the home feed until it's approved. In the meantime, feel free to look around and add more dishes.",
        [{ text: 'Explore dashboard', onPress: () => router.replace('/(cook)/(tabs)/today') }]
      );
    } catch (e: any) {
      Alert.alert('Could not submit application', e.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step content ─────────────────────────────────────────────────
  const renderStepContent = () => {
    switch (step) {
      case 'restaurant':
        return (
          <>
            <TextInput
              style={styles.textBox}
              value={restaurantName}
              onChangeText={t => setRestaurantName(t.slice(0, RESTAURANT_NAME_LIMIT))}
              placeholder="e.g. Sarah's Home Kitchen"
              placeholderTextColor="#bbb"
              autoFocus
              autoCapitalize="words"
            />
            <Text style={styles.counter}>
              {restaurantName.length}/{RESTAURANT_NAME_LIMIT}
            </Text>
          </>
        );

      case 'photo':
        return (
          <TouchableOpacity style={styles.photoArea} onPress={pickPhoto} activeOpacity={0.8}>
            {photoUri ? (
              <>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <View style={styles.photoEditBadge}>
                  <Ionicons name="pencil" size={14} color="#1A1A1A" />
                  <Text style={styles.photoEditBadgeText}>Change</Text>
                </View>
              </>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={36} color="#999" />
                <Text style={styles.photoPlaceholderText}>Tap to add a photo</Text>
              </View>
            )}
          </TouchableOpacity>
        );

      case 'title':
        return (
          <>
            <TextInput
              style={styles.textBox}
              value={title}
              onChangeText={t => setTitle(t.slice(0, TITLE_LIMIT))}
              placeholder="e.g. The American Burger"
              placeholderTextColor="#bbb"
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <Text style={styles.counter}>
              {title.length}/{TITLE_LIMIT}
            </Text>
          </>
        );

      case 'description':
        return (
          <>
            <TextInput
              style={[styles.textBox, styles.textBoxTall]}
              value={description}
              onChangeText={t => setDescription(t.slice(0, DESCRIPTION_LIMIT))}
              placeholder="Double cheeseburger with lettuce, tomato…"
              placeholderTextColor="#bbb"
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <Text style={styles.counter}>
              {description.length}/{DESCRIPTION_LIMIT}
            </Text>
          </>
        );

      case 'ingredients':
        return (
          <>
            <TextInput
              style={[styles.textBox, styles.textBoxTall]}
              value={ingredientsText}
              onChangeText={t => setIngredientsText(t.slice(0, INGREDIENTS_LIMIT))}
              placeholder={'One ingredient per line\n\nChicken breast\nOlive oil\nGarlic'}
              placeholderTextColor="#bbb"
              multiline
              autoFocus
              textAlignVertical="top"
            />
            <Text style={styles.counter}>
              {ingredientsList.length} ingredient{ingredientsList.length === 1 ? '' : 's'} ·{' '}
              {ingredientsText.length}/{INGREDIENTS_LIMIT}
            </Text>
          </>
        );

      case 'keywords':
        return (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Cuisine</Text>
              <Text style={styles.sectionHint}>Pick 1</Text>
            </View>
            <View style={styles.chipGrid}>
              {CUISINE_OPTIONS.map(kw => {
                const selected = cuisine === kw;
                return (
                  <TouchableOpacity
                    key={kw}
                    onPress={() => toggleCuisine(kw)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={[styles.chipText, selected && styles.chipTextSelected]}
                      numberOfLines={1}
                    >
                      {kw}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
              <Text style={styles.sectionLabel}>Tags</Text>
              <Text style={styles.sectionHint}>
                {dietaryTags.length}/{MAX_DIETARY_TAGS}
              </Text>
            </View>
            <View style={styles.chipGrid}>
              {DIETARY_TAG_OPTIONS.map(kw => {
                const selected = dietaryTags.includes(kw);
                const disabled = !selected && dietaryTags.length >= MAX_DIETARY_TAGS;
                return (
                  <TouchableOpacity
                    key={kw}
                    onPress={() => toggleDietaryTag(kw)}
                    disabled={disabled}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                      disabled && styles.chipDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextSelected,
                        disabled && styles.chipTextDisabled,
                      ]}
                      numberOfLines={1}
                    >
                      {kw}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );

      case 'price':
        return (
          <View style={styles.priceWrapper}>
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>RM </Text>
              <TextInput
                style={styles.priceInput}
                value={priceText}
                onChangeText={t => setPriceText(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                selectTextOnFocus
              />
            </View>
            <View style={styles.priceAdjustRow}>
              <TouchableOpacity style={styles.priceAdjustBtn} onPress={() => adjustPrice(-1)}>
                <Text style={styles.priceAdjustText}>−1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.priceAdjustBtn} onPress={() => adjustPrice(1)}>
                <Text style={styles.priceAdjustText}>+1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.priceAdjustBtn} onPress={() => adjustPrice(5)}>
                <Text style={styles.priceAdjustText}>+5</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'address':
        return (
          <View style={{ gap: 12 }}>
            {/* Autocomplete search (OpenStreetMap / Nominatim) */}
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color="#888" />
              <TextInput
                style={styles.searchInput}
                value={addrSearchQuery}
                onChangeText={setAddrSearchQuery}
                placeholder="Search for your address"
                placeholderTextColor="#bbb"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {addrSearching && <ActivityIndicator size="small" color="#888" />}
              {addrSearchQuery.length > 0 && !addrSearching && (
                <TouchableOpacity onPress={() => setAddrSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="#bbb" />
                </TouchableOpacity>
              )}
            </View>

            {addrSuggestions.length > 0 && (
              <View style={styles.suggestionList}>
                {addrSuggestions.map(s => (
                  <TouchableOpacity
                    key={s.place_id}
                    style={styles.suggestionRow}
                    onPress={() => selectAddrSuggestion(s)}
                  >
                    <Ionicons name="location-outline" size={18} color="#666" />
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {s.display_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.manualLabel}>Or enter manually</Text>

            {[
              { key: 'country', label: 'Country / region', required: true },
              { key: 'flat', label: 'Flat, floor, bldg', required: false },
              { key: 'property_name', label: 'Property name', required: false },
              { key: 'street', label: 'Street address', required: true },
              { key: 'locality', label: 'Locality', required: false },
              { key: 'town', label: 'Town', required: true },
              { key: 'postcode', label: 'Postcode', required: true, numeric: true },
            ].map(({ key, label, required, numeric }) => (
              <View key={key} style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={(addr as any)[key]}
                  onChangeText={text => setAddr(prev => ({ ...prev, [key]: text }))}
                  placeholder={required ? '' : '(optional)'}
                  placeholderTextColor="#bbb"
                  keyboardType={numeric ? 'number-pad' : 'default'}
                  autoCapitalize="words"
                />
              </View>
            ))}
          </View>
        );

      case 'food-safety':
        return (
          <>
            <Text style={styles.fsQuestion}>How are you hosting on Chefin?</Text>
            <RadioRow
              title="I'm hosting as a private individual"
              subtitle="Perfect for cooks sharing meals from home"
              selected={hostingType === 'private'}
              onPress={() => setHostingType('private')}
            />
            <RadioRow
              title="I'm hosting as part of a business"
              subtitle="If you run a licensed kitchen or catering business"
              selected={hostingType === 'business'}
              onPress={() => setHostingType('business')}
            />
            <View style={styles.divider} />
            <Text style={styles.fsQuestion}>Do you have a valid Food Safety License?</Text>
            <Text style={styles.fsHint}>
              Sharing your license helps build trust and unlocks the &ldquo;Verified Cook&rdquo;
              status.
            </Text>
            <RadioRow
              title="Yes, I have a license"
              selected={licenseAnswer === 'yes'}
              onPress={() => setLicenseAnswer('yes')}
            />
            {licenseAnswer === 'yes' && (
              <View style={styles.uploadWrap}>
                <Text style={styles.uploadHint}>Upload a photo or scan:</Text>
                <TouchableOpacity
                  style={styles.uploadBox}
                  onPress={pickLicense}
                  activeOpacity={0.7}
                >
                  {licenseAsset ? (
                    licenseAsset.isPdf ? (
                      <View style={styles.pdfBadge}>
                        <Ionicons name="document-text-outline" size={32} color="#1A1A1A" />
                        <Text style={styles.pdfBadgeText} numberOfLines={1}>
                          {licenseAsset.name}
                        </Text>
                        <Text style={styles.pdfBadgeHint}>Tap to replace</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: licenseAsset.uri }} style={styles.uploadPreview} />
                    )
                  ) : (
                    <Ionicons name="add" size={32} color="#888" />
                  )}
                </TouchableOpacity>
              </View>
            )}
            <RadioRow
              title="No, I don't have one"
              subtitle="Don't worry, you can still cook. We'll share simple safety guidelines for home cooks"
              selected={licenseAnswer === 'no'}
              onPress={() => {
                setLicenseAnswer('no');
                setLicenseAsset(null);
              }}
            />
          </>
        );

      case 'payment': {
        const brand = detectBrand(cardDigits);
        return (
          <View style={{ gap: 14 }}>
            <View>
              <Text style={styles.fieldLabel}>CARD NUMBER</Text>
              <View style={styles.cardInputWrapper}>
                <Ionicons name="card" size={22} color="#666" style={{ marginRight: 10 }} />
                <TextInput
                  ref={cardRef}
                  placeholder="1234 5678 9012 3456"
                  style={{ flex: 1, fontSize: 16 }}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={formatCardNumber(cardDigits)}
                  onChangeText={onCardChange}
                  maxLength={19}
                  autoComplete="cc-number"
                  textContentType="creditCardNumber"
                  returnKeyType="next"
                />
                {brand && <Text style={styles.brandTag}>{brand}</Text>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>EXPIRY</Text>
                <TextInput
                  ref={expRef}
                  placeholder="MM/YY"
                  style={styles.halfInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={formatExpiry(expDigits)}
                  onChangeText={onExpChange}
                  maxLength={5}
                  returnKeyType="next"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>CVC</Text>
                <TextInput
                  ref={cvcRef}
                  placeholder="123"
                  style={styles.halfInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={cvcDigits}
                  onChangeText={onCvcChange}
                  maxLength={3}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleNext}
                />
              </View>
            </View>
            <Text style={styles.disclaimer}>
              Test mode — card data is stored locally on this device. Production payments should be
              tokenised via Stripe or similar.
            </Text>
          </View>
        );
      }
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  const heading = STEP_HEADINGS[step];
  const advanceLabel = isLast ? 'Submit application' : 'Next';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.saveExitChip} onPress={handleSaveExit}>
            <Text style={styles.saveExitText}>Save & exit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{heading.title}</Text>
          {heading.subtitle ? <Text style={styles.subtitle}>{heading.subtitle}</Text> : null}

          <View style={styles.stepBody}>{renderStepContent()}</View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.progressRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.progressSegment, i <= stepIdx && styles.progressSegmentFilled]}
              />
            ))}
          </View>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={handleBack} style={styles.backLink}>
              <Text style={styles.backLinkText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNext}
              disabled={!canAdvance() || submitting}
              style={[
                styles.nextBtn,
                isLast && styles.nextBtnLast,
                (!canAdvance() || submitting) && styles.nextBtnDisabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.nextBtnText}>{advanceLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RadioRow({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.radioRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.radioTitle}>{title}</Text>
        {subtitle ? <Text style={styles.radioSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topRow: { paddingHorizontal: 24, paddingTop: 8 },
  saveExitChip: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: '#1A1A1A',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  saveExitText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', lineHeight: 34 },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8, lineHeight: 20 },
  stepBody: { marginTop: 32 },

  photoArea: {
    height: 240,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholder: { alignItems: 'center', gap: 10 },
  photoPlaceholderText: { fontSize: 14, color: '#888', fontWeight: '500' },
  photoPreview: { width: '100%', height: '100%' },
  photoEditBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  photoEditBadgeText: { fontSize: 12, fontWeight: '600', color: '#1A1A1A' },

  textBox: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  textBoxTall: { minHeight: 150 },
  counter: { fontSize: 12, color: '#888', marginTop: 6, fontWeight: '500' },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionHint: { fontSize: 12, color: '#888', fontWeight: '500' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  chip: {
    width: '31%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  chipDisabled: { borderColor: '#F0F0F0', backgroundColor: '#FAFAFA' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  chipTextSelected: { color: '#fff' },
  chipTextDisabled: { color: '#BBB' },

  priceWrapper: { alignItems: 'center', marginTop: 30 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  priceCurrency: { fontSize: 36, fontWeight: '800', color: '#1A1A1A' },
  priceInput: {
    fontSize: 56,
    fontWeight: '800',
    color: '#1A1A1A',
    minWidth: 100,
    textAlign: 'center',
    padding: 0,
  },
  priceAdjustRow: { flexDirection: 'row', gap: 10, marginTop: 28 },
  priceAdjustBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  priceAdjustText: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A' },
  suggestionList: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  suggestionText: { flex: 1, fontSize: 13, color: '#1A1A1A', lineHeight: 18 },
  manualLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  fieldWrap: { gap: 4 },
  fieldLabel: { fontSize: 11, color: '#888', fontWeight: '600', letterSpacing: 0.4 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
  },

  fsQuestion: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 8, marginTop: 8 },
  fsHint: { fontSize: 13, color: '#888', marginBottom: 12, marginTop: -4, lineHeight: 18 },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  radioTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  radioSubtitle: { fontSize: 12, color: '#888', lineHeight: 16 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: '#4CAF50' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#4CAF50' },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 16 },

  uploadWrap: { marginLeft: 4, marginTop: 4, marginBottom: 8 },
  uploadHint: { fontSize: 13, color: '#666', marginBottom: 8 },
  uploadBox: {
    height: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CCC',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 10,
  },
  uploadPreview: { width: '100%', height: '100%' },
  pdfBadge: { alignItems: 'center', gap: 4 },
  pdfBadgeText: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  pdfBadgeHint: { fontSize: 11, color: '#888' },

  cardInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  brandTag: { fontSize: 12, fontWeight: '600', color: '#4CAF50', marginLeft: 8 },
  halfInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  disclaimer: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },

  footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: 16 },
  progressSegment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#E0E0E0' },
  progressSegmentFilled: { backgroundColor: '#4CAF50' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backLink: { paddingVertical: 12, paddingRight: 12 },
  backLinkText: {
    fontSize: 15,
    color: '#1A1A1A',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 36,
    minWidth: 140,
    alignItems: 'center',
  },
  nextBtnLast: { paddingHorizontal: 28, minWidth: 180 },
  nextBtnDisabled: { backgroundColor: '#A5D6A7' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
