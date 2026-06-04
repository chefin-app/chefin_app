import React, { useState, useEffect } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

type Step = 'photo' | 'title' | 'description' | 'ingredients' | 'keywords' | 'price';
const STEPS: Step[] = ['photo', 'title', 'description', 'ingredients', 'keywords', 'price'];

const TITLE_LIMIT = 32;
const DESCRIPTION_LIMIT = 200;
const INGREDIENTS_LIMIT = 500;
const MAX_DIETARY_TAGS = 4;
const DISH_IMAGES_BUCKET = 'dish-images';

// Cuisines — cook must pick exactly one. Drives the home cuisine filter.
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

// Dietary / meal / attribute tags — cook picks up to MAX_DIETARY_TAGS.
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

export default function AddDishScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [addressChecked, setAddressChecked] = useState(false);

  // Gate: require an address before letting the cook create a dish.
  useEffect(() => {
    if (!user) {
      setAddressChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('address_street, address_town, address_postcode, address_country')
        .eq('user_id', user.id)
        .single();
      if (cancelled) return;
      const hasAddress =
        !!data?.address_street &&
        !!data?.address_town &&
        !!data?.address_postcode &&
        !!data?.address_country;
      if (!hasAddress) {
        Alert.alert(
          'Add your kitchen address first',
          'Customers need to know where their order is coming from.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => router.back(),
            },
            {
              text: 'Add address',
              onPress: () =>
                router.replace({
                  pathname: '/(cook)/address',
                  params: { next: '/(cook)/add-dish' },
                }),
            },
          ],
          { cancelable: false }
        );
      }
      setAddressChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  const [stepIdx, setStepIdx] = useState(0);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [priceText, setPriceText] = useState('5');
  const [submitting, setSubmitting] = useState(false);

  const ingredientsList = ingredientsText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

  const canAdvance = (): boolean => {
    switch (step) {
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
    }
  };

  const handleSaveExit = () => {
    Alert.alert('Discard dish?', 'Your changes will be lost. Drafts are not yet saved.', [
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
    if (isLast) {
      await submit();
      return;
    }
    setStepIdx(stepIdx + 1);
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access in Settings to add a dish photo.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const toggleCuisine = (kw: string) => {
    setCuisine(prev => (prev === kw ? null : kw));
  };

  const toggleDietaryTag = (kw: string) => {
    setDietaryTags(prev => {
      if (prev.includes(kw)) return prev.filter(k => k !== kw);
      if (prev.length >= MAX_DIETARY_TAGS) return prev; // hard cap
      return [...prev, kw];
    });
  };

  const submit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to publish dishes.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, address_locality')
        .eq('user_id', user.id)
        .single();
      if (profileErr || !profile) throw new Error('No profile found for your account.');

      // Rough public-facing location. Exact address is in profiles and only
      // revealed to customers after they place an order.
      const roughLocation = profile.address_locality || null;

      let imageUrl: string | null = null;
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
        imageUrl = pub.publicUrl;
      }

      const { error: insertErr } = await supabase.from('listings').insert({
        cook_id: profile.id,
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        image_url: imageUrl,
        cuisine,
        dietary_tags: dietaryTags,
        ingredients: ingredientsList,
        location: roughLocation,
        is_active: true,
      });
      if (insertErr) throw insertErr;

      router.replace('/(cook)/(tabs)/menu');
    } catch (e: any) {
      Alert.alert('Could not save dish', e.message ?? 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!addressChecked) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Exit pill (top-left, every screen) */}
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.saveExitChip} onPress={handleSaveExit}>
            <Text style={styles.saveExitText}>Exit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{stepTitle(step)}</Text>
          <Text style={styles.subtitle}>{stepSubtitle(step)}</Text>

          <View style={styles.stepBody}>
            {step === 'photo' && (
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
            )}

            {step === 'title' && (
              <View>
                <TextInput
                  style={styles.textBox}
                  value={title}
                  onChangeText={text => setTitle(text.slice(0, TITLE_LIMIT))}
                  placeholder="e.g. The American Burger"
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>
                  {title.length}/{TITLE_LIMIT}
                </Text>
              </View>
            )}

            {step === 'description' && (
              <View>
                <TextInput
                  style={[styles.textBox, styles.textBoxTall]}
                  value={description}
                  onChangeText={text => setDescription(text.slice(0, DESCRIPTION_LIMIT))}
                  placeholder="Double cheeseburger with lettuce, tomato…"
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>
                  {description.length}/{DESCRIPTION_LIMIT}
                </Text>
              </View>
            )}

            {step === 'ingredients' && (
              <View>
                <TextInput
                  style={[styles.textBox, styles.textBoxTall]}
                  value={ingredientsText}
                  onChangeText={text => setIngredientsText(text.slice(0, INGREDIENTS_LIMIT))}
                  placeholder={
                    'One ingredient per line, e.g.\n\nChicken breast\nOlive oil\nGarlic\nSea salt'
                  }
                  placeholderTextColor="#bbb"
                  multiline
                  autoFocus
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>
                  {ingredientsList.length} ingredient{ingredientsList.length === 1 ? '' : 's'} ·{' '}
                  {ingredientsText.length}/{INGREDIENTS_LIMIT}
                </Text>
              </View>
            )}

            {step === 'keywords' && (
              <View>
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

                <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
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
              </View>
            )}

            {step === 'price' && (
              <View style={styles.priceWrapper}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceCurrency}>RM </Text>
                  <TextInput
                    style={styles.priceInput}
                    value={priceText}
                    onChangeText={text => setPriceText(text.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    selectTextOnFocus
                  />
                  <View style={styles.pricePencil}>
                    <Ionicons name="pencil" size={12} color="#1A1A1A" />
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer: progress + back/next */}
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
              style={[styles.nextBtn, (!canAdvance() || submitting) && styles.nextBtnDisabled]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.nextBtnText}>{isLast ? 'Publish' : 'Next'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function stepTitle(step: Step): string {
  switch (step) {
    case 'photo':
      return 'Add a photo of your dish';
    case 'title':
      return "Now, let's give your dish a title";
    case 'description':
      return 'Next, create a description';
    case 'ingredients':
      return 'List your ingredients';
    case 'keywords':
      return 'Choose your keywords';
    case 'price':
      return 'Now, set a base price';
  }
}

function stepSubtitle(step: Step): string {
  switch (step) {
    case 'photo':
      return 'A clear photo helps your dish stand out.';
    case 'title':
      return 'Short titles work best. Have fun with it — you can always change it later.';
    case 'description':
      return 'Make it catchy and appealing — you can always change it later.';
    case 'ingredients':
      return 'Help diners with allergies and preferences. One ingredient per line.';
    case 'keywords':
      return 'Pick 1 cuisine that fits your dish, plus up to 4 tags.';
    case 'price':
      return 'You can change this anytime.';
  }
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
  stepBody: { marginTop: 40, minHeight: 280 },

  // Photo
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

  // Text boxes
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

  // Keywords (3-column grid matching the mockup)
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  chipSelected: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  chipDisabled: { borderColor: '#F0F0F0', backgroundColor: '#FAFAFA', shadowOpacity: 0 },
  chipText: { fontSize: 14, fontWeight: '500', color: '#1A1A1A' },
  chipTextSelected: { color: '#fff' },
  chipTextDisabled: { color: '#BBB' },

  // Price — large centred "RM X" with a small pencil hint
  priceWrapper: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 320 },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  priceCurrency: { fontSize: 48, fontWeight: '800', color: '#1A1A1A' },
  priceInput: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1A1A1A',
    minWidth: 60,
    padding: 0,
  },
  pricePencil: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    marginTop: 22,
  },

  // Footer
  footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
  },
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
  nextBtnDisabled: { backgroundColor: '#A5D6A7' },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
