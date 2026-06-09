import React, { useEffect, useState } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

const DISH_IMAGES_BUCKET = 'dish-images';
const MAX_DIETARY_TAGS = 4;

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

export default function EditDishScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [dietaryTags, setDietaryTags] = useState<string[]>([]);
  const [priceText, setPriceText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // Track the existing storage path so we can clean up on photo replace / remove.
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  // Pending-review dishes are read-only until an admin approves them.
  const [status, setStatus] = useState<string>('approved');
  const isPending = status === 'pending';

  // Snapshot of the moderation-relevant fields at load time, so we can detect
  // changes that require re-review on save. Price is intentionally excluded.
  const [original, setOriginal] = useState<{
    title: string;
    description: string;
    ingredients: string[];
    cuisine: string | null;
    dietaryTags: string[];
    imageUrl: string | null;
  } | null>(null);

  const priceNum = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

  // ── Load existing listing ──────────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('listings')
          .select(
            'title, description, ingredients, cuisine, dietary_tags, price, image_url, status'
          )
          .eq('id', id)
          .single();
        if (error) throw error;
        if (!data) throw new Error('Dish not found.');

        const loadedTitle = data.title ?? '';
        const loadedDescription = data.description ?? '';
        const loadedIngredients: string[] = data.ingredients ?? [];
        const loadedCuisine = data.cuisine ?? null;
        const loadedTags: string[] = data.dietary_tags ?? [];
        const loadedImageUrl = data.image_url ?? null;

        setTitle(loadedTitle);
        setDescription(loadedDescription);
        setIngredientsText(loadedIngredients.join('\n'));
        setCuisine(loadedCuisine);
        setDietaryTags(loadedTags);
        setPriceText(String(data.price ?? ''));
        setImageUrl(loadedImageUrl);
        setExistingImagePath(extractStoragePath(data.image_url));
        setStatus(data.status ?? 'approved');

        setOriginal({
          title: loadedTitle,
          description: loadedDescription,
          ingredients: loadedIngredients,
          cuisine: loadedCuisine,
          dietaryTags: loadedTags,
          imageUrl: loadedImageUrl,
        });
      } catch (e: any) {
        Alert.alert('Could not load dish', e.message ?? 'Unknown error', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user, router]);

  // ── Photo ──────────────────────────────────────────────────────
  const pickAndUploadPhoto = async () => {
    if (!user) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      // Need profile.id for the storage path prefix.
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!profile) throw new Error('Profile not found.');

      const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const path = `${profile.id}/${Date.now()}.${ext}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadErr } = await supabase.storage
        .from(DISH_IMAGES_BUCKET)
        .upload(path, arrayBuffer, { contentType, upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage.from(DISH_IMAGES_BUCKET).getPublicUrl(path);
      const newUrl = pub.publicUrl;

      // Best-effort cleanup of the old image
      if (existingImagePath) {
        supabase.storage
          .from(DISH_IMAGES_BUCKET)
          .remove([existingImagePath])
          .catch(() => {});
      }

      setImageUrl(newUrl);
      setExistingImagePath(path);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Keywords ───────────────────────────────────────────────────
  const toggleCuisine = (kw: string) => {
    setCuisine(prev => (prev === kw ? null : kw));
  };

  const toggleDietaryTag = (kw: string) => {
    setDietaryTags(prev => {
      if (prev.includes(kw)) return prev.filter(k => k !== kw);
      if (prev.length >= MAX_DIETARY_TAGS) return prev;
      return [...prev, kw];
    });
  };

  // ── Save ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!id) return;
    const titleTrim = title.trim();
    const descTrim = description.trim();
    const ingredientsList = ingredientsText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (!titleTrim) return Alert.alert('Missing title', 'Title is required.');
    if (!descTrim) return Alert.alert('Missing description', 'Description is required.');
    if (ingredientsList.length === 0)
      return Alert.alert('Missing ingredients', 'Add at least one ingredient.');
    if (!cuisine) return Alert.alert('Missing cuisine', 'Pick one cuisine.');
    if (priceNum <= 0) return Alert.alert('Invalid price', 'Price must be greater than 0.');

    // Detect moderation-relevant changes (price is intentionally excluded).
    const arraysEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);

    const moderationChanged =
      !!original &&
      (original.title !== titleTrim ||
        original.description !== descTrim ||
        original.imageUrl !== imageUrl ||
        original.cuisine !== cuisine ||
        !arraysEqual(original.ingredients, ingredientsList) ||
        !arraysEqual(original.dietaryTags, dietaryTags));

    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        title: titleTrim,
        description: descTrim,
        ingredients: ingredientsList,
        cuisine,
        dietary_tags: dietaryTags,
        price: priceNum,
        image_url: imageUrl,
      };
      if (moderationChanged) updates.status = 'pending';

      const { error } = await supabase.from('listings').update(updates).eq('id', id);
      if (error) throw error;

      if (moderationChanged) {
        Alert.alert(
          'Sent for re-review',
          'Your changes affect what customers see, so the dish will be hidden from the feed until an admin re-approves it.',
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // ── Remove ─────────────────────────────────────────────────────
  const handleRemove = () => {
    if (!id) return;
    Alert.alert('Remove dish?', 'This will delete the dish permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          try {
            const { error } = await supabase.from('listings').delete().eq('id', id);
            if (error) throw error;
            if (existingImagePath) {
              supabase.storage
                .from(DISH_IMAGES_BUCKET)
                .remove([existingImagePath])
                .catch(() => {});
            }
            router.back();
          } catch (e: any) {
            Alert.alert('Could not remove', e.message ?? 'Unknown error');
          } finally {
            setRemoving(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit dish</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {isPending && (
            <View style={styles.pendingBanner}>
              <Ionicons name="time-outline" size={16} color="#B26B00" />
              <Text style={styles.pendingBannerText}>
                This dish is pending review. You can edit it once an admin approves it.
              </Text>
            </View>
          )}

          {/* Photo */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Photo</Text>
            <TouchableOpacity
              style={styles.photoArea}
              onPress={pickAndUploadPhoto}
              disabled={uploadingPhoto || isPending}
              activeOpacity={0.8}
            >
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={32} color="#999" />
                </View>
              )}
              {uploadingPhoto && (
                <View style={styles.photoOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={styles.photoEditBadge}>
                <Text style={styles.photoEditBadgeText}>
                  {uploadingPhoto ? 'Uploading…' : 'Click to edit'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={text => setTitle(text.slice(0, 32))}
              placeholder="The American Burger"
              placeholderTextColor="#bbb"
              maxLength={32}
              editable={!isPending}
            />
          </View>

          {/* Description */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description}
              onChangeText={text => setDescription(text.slice(0, 200))}
              placeholder="Double cheeseburger with lettuce, tomato…"
              placeholderTextColor="#bbb"
              multiline
              maxLength={200}
              textAlignVertical="top"
              editable={!isPending}
            />
            <Text style={styles.counter}>{description.length}/200</Text>
          </View>

          {/* Ingredients */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Ingredients</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={ingredientsText}
              onChangeText={text => setIngredientsText(text.slice(0, 500))}
              placeholder={'One ingredient per line\n\nChicken breast\nOlive oil\nGarlic'}
              placeholderTextColor="#bbb"
              multiline
              maxLength={500}
              textAlignVertical="top"
              editable={!isPending}
            />
          </View>

          {/* Price */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Price</Text>
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>RM</Text>
              <TextInput
                style={styles.priceInput}
                value={priceText}
                onChangeText={text => setPriceText(text.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder="0.00"
                placeholderTextColor="#bbb"
                editable={!isPending}
              />
            </View>
          </View>

          {/* Keywords */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Keywords</Text>

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
                    disabled={isPending}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                      isPending && !selected && styles.chipDisabled,
                    ]}
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
                const disabled = isPending || (!selected && dietaryTags.length >= MAX_DIETARY_TAGS);
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

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, (saving || isPending) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || removing || isPending}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>
                {isPending ? 'Locked until approved' : 'Save changes'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Remove */}
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={handleRemove}
            disabled={saving || removing}
          >
            {removing ? (
              <ActivityIndicator color="#FF4D4D" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="#FF4D4D" />
                <Text style={styles.removeBtnText}>Remove dish</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Pulls "<profile_id>/<filename>" out of a public Supabase Storage URL. */
function extractStoragePath(publicUrl?: string | null): string | null {
  if (!publicUrl) return null;
  const marker = `/storage/v1/object/public/${DISH_IMAGES_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? publicUrl.slice(idx + marker.length) : null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  pendingBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#B26B00',
    fontWeight: '600',
    lineHeight: 18,
  },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },

  card: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  photoArea: {
    alignSelf: 'center',
    width: '92%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  photoEditBadgeText: { fontSize: 12, fontWeight: '600', color: '#1A1A1A' },

  input: {
    fontSize: 16,
    color: '#1A1A1A',
    paddingVertical: 6,
  },
  inputMultiline: { minHeight: 80 },
  counter: { fontSize: 12, color: '#888', alignSelf: 'flex-end' },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceCurrency: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  priceInput: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1A1A1A' },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sectionHint: { fontSize: 11, color: '#888', fontWeight: '500' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  chip: {
    width: '31%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  chipDisabled: { borderColor: '#F0F0F0', backgroundColor: '#FAFAFA' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#1A1A1A' },
  chipTextSelected: { color: '#fff' },
  chipTextDisabled: { color: '#BBB' },

  saveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: '#A5D6A7' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  removeBtnText: { color: '#FF4D4D', fontSize: 15, fontWeight: '700' },
});
