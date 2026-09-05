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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import { TIER1_DOCUMENTS, VerificationDocType } from '@/src/constants/verification';
import { BankSelect } from '@/src/components/inputs/BankSelect';
import { FoodComplianceAcknowledgement } from '@/src/components/food-safety/FoodComplianceAcknowledgement';
import {
  getCurrentFoodComplianceAcceptance,
  recordFoodComplianceAcceptance,
} from '@/src/utils/foodCompliance';
import {
  geocodeRestaurantAddress,
  RestaurantLocationError,
  saveRestaurantDiscoveryLocation,
  type RestaurantDiscoveryLocationDraft,
} from '@/src/utils/restaurantLocation';

// ── Constants ───────────────────────────────────────────────────────
const RESTAURANT_NAME_LIMIT = 40;
const TITLE_LIMIT = 32;
const DESCRIPTION_LIMIT = 200;
const INGREDIENTS_LIMIT = 500;
const MAX_DIETARY_TAGS = 4;
const DISH_IMAGES_BUCKET = 'dish-images';
const FOOD_SAFETY_BUCKET = 'food-safety-licenses';
const IDENTITY_BUCKET = 'cook-identity-documents';

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
  lat: string;
  lon: string;
  address?: NominatimAddress;
};

const DIETARY_TAG_OPTIONS = ['Vegetarian', 'Non-pork'];

type Step =
  | 'restaurant'
  | 'photo'
  | 'title'
  | 'description'
  | 'ingredients'
  | 'keywords'
  | 'price'
  | 'address'
  | 'identity'
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
  'identity',
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
  identity: {
    title: 'Confirm your eligibility to sell',
    subtitle:
      'Chefin currently accepts Malaysian citizens and permanent residents. Your document is kept private and only authorised identity reviewers can open it.',
  },
  'food-safety': {
    title: 'Share food safety details',
    subtitle: '',
  },
  payment: {
    title: 'Add your payout details',
    subtitle: 'Earnings are transferred to this bank account once your orders are completed.',
  },
};

// ── Component ───────────────────────────────────────────────────────
export default function StartRestaurantWizard() {
  const router = useRouter();
  const { resubmit } = useLocalSearchParams<{ resubmit?: string }>();
  const isResubmission = resubmit === '1';
  const { user, session } = useAuth();

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  const [submitting, setSubmitting] = useState(false);
  const [loadingExistingApplication, setLoadingExistingApplication] = useState(isResubmission);
  const [resubmitListingId, setResubmitListingId] = useState<string | null>(null);

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
    country: 'Malaysia',
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
  const [restaurantDiscoveryLocation, setRestaurantDiscoveryLocation] =
    useState<RestaurantDiscoveryLocationDraft | null>(null);
  const [addressLocationError, setAddressLocationError] = useState<string | null>(null);
  const addrAbortRef = useRef<AbortController | null>(null);
  const addressSearchRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

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
        const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=my`;
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
    setAddressLocationError(null);
    const latitude = Number(s.lat);
    const longitude = Number(s.lon);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      setRestaurantDiscoveryLocation({
        latitude,
        longitude,
        label: s.display_name,
        source: 'address_search',
      });
    }
  };

  const [citizenshipType, setCitizenshipType] = useState<
    'malaysian_citizen' | 'permanent_resident' | null
  >(null);
  const [identityDocument, setIdentityDocument] = useState<{
    uri: string;
    mime: string;
    name: string;
    isPdf: boolean;
  } | null>(null);

  // Food/business credentials are optional and may be added later for badges.
  const [hostingType, setHostingType] = useState<'private' | 'business' | null>(null);
  const [complianceAccepted, setComplianceAccepted] = useState(false);
  const [complianceAcceptedAt, setComplianceAcceptedAt] = useState<string | null>(null);
  const [verificationDocs, setVerificationDocs] = useState<
    Partial<
      Record<VerificationDocType, { uri: string; mime: string; name: string; isPdf: boolean }>
    >
  >({});

  useEffect(() => {
    if (!user) return;

    getCurrentFoodComplianceAcceptance(user.id)
      .then(acceptance => {
        if (acceptance) {
          setComplianceAccepted(true);
          setComplianceAcceptedAt(acceptance.acceptedAt);
        }
      })
      .catch(error => {
        console.warn('Could not load food compliance acceptance', error.message);
      });
  }, [user]);

  useEffect(() => {
    if (!isResubmission || !user) {
      setLoadingExistingApplication(false);
      return;
    }
    if (!session?.access_token) return;

    let cancelled = false;
    (async () => {
      try {
        const [{ data: profile, error: profileError }, applicationResponse] = await Promise.all([
          supabase
            .from('profiles')
            .select(
              'id, restaurant_name, address_country, address_flat, address_property_name, address_street, address_locality, address_town, address_postcode, hosting_type, bank_name, bank_account_name, bank_account_number'
            )
            .eq('user_id', user.id)
            .single(),
          fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/cook-applications/status`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        ]);
        if (profileError) throw profileError;
        const applicationPayload = (await applicationResponse.json().catch(() => ({}))) as {
          application?: { status?: string; citizenship_type?: string } | null;
          error?: string;
        };
        if (!applicationResponse.ok) {
          throw new Error(applicationPayload.error ?? 'Could not load your application status.');
        }
        const application = applicationPayload.application;
        if (application?.status !== 'rejected') {
          throw new Error('Only a rejected application can be edited and resubmitted.');
        }

        const { data: listing, error: listingError } = await supabase
          .from('listings')
          .select('id, title, description, ingredients, cuisine, dietary_tags, price, image_url')
          .eq('cook_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (listingError) throw listingError;
        if (cancelled) return;

        setRestaurantName(profile.restaurant_name ?? '');
        setAddr({
          country: profile.address_country ?? 'Malaysia',
          flat: profile.address_flat ?? '',
          property_name: profile.address_property_name ?? '',
          street: profile.address_street ?? '',
          locality: profile.address_locality ?? '',
          town: profile.address_town ?? '',
          postcode: profile.address_postcode ?? '',
        });
        setHostingType(profile.hosting_type === 'business' ? 'business' : 'private');
        setBankName(profile.bank_name ?? '');
        setBankAccountName(profile.bank_account_name ?? '');
        setBankAccountNumber(profile.bank_account_number ?? '');
        setCitizenshipType(
          application.citizenship_type === 'permanent_resident'
            ? 'permanent_resident'
            : 'malaysian_citizen'
        );
        if (listing) {
          setResubmitListingId(listing.id);
          setTitle(listing.title ?? '');
          setDescription(listing.description ?? '');
          setIngredientsText(
            Array.isArray(listing.ingredients)
              ? listing.ingredients.join('\n')
              : String(listing.ingredients ?? '')
          );
          setCuisine(listing.cuisine ?? null);
          setDietaryTags(Array.isArray(listing.dietary_tags) ? listing.dietary_tags : []);
          setPriceText(String(listing.price ?? 5));
          setPhotoUri(listing.image_url ?? null);
        }
      } catch (error: any) {
        Alert.alert(
          'Application unavailable',
          error.message ?? 'Could not load your application.',
          [{ text: 'Back', onPress: () => router.back() }]
        );
      } finally {
        if (!cancelled) setLoadingExistingApplication(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isResubmission, router, session?.access_token, user]);

  // Payment step — payout bank account, not a card. Earnings from completed
  // orders are transferred here.
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const bankAccountNameRef = useRef<TextInput>(null);
  const bankAccountNumberRef = useRef<TextInput>(null);

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
      case 'identity':
        return citizenshipType != null && identityDocument != null;
      case 'food-safety':
        return hostingType != null && complianceAccepted;
      case 'payment':
        return (
          bankName.trim().length > 0 &&
          bankAccountName.trim().length > 0 &&
          bankAccountNumber.length >= 8
        );
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
    // Special: payment step → final commit
    if (step === 'payment') {
      await submit();
      return;
    }
    setStepIdx(stepIdx + 1);
  };

  // ── Photo picker ─────────────────────────────────────────────────
  const choosePhotoFromLibrary = async () => {
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

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow camera access to take a dish photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
  };

  const pickPhoto = () => {
    Alert.alert('Add a dish photo', 'Choose where your photo comes from.', [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from library', onPress: choosePhotoFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Verification document picker (one slot per Tier 1 doc type) ──
  const pickVerificationDoc = async (docType: VerificationDocType) => {
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
    setVerificationDocs(prev => ({
      ...prev,
      [docType]: {
        uri: asset.uri,
        mime,
        name: asset.name ?? `${docType}.${ext}`,
        isPdf: ext === 'pdf',
      },
    }));
  };

  const removeVerificationDoc = (docType: VerificationDocType) => {
    setVerificationDocs(prev => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  };

  const pickIdentityDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ext = (asset.name?.split('.').pop() ?? asset.uri.split('.').pop() ?? 'pdf').toLowerCase();
    setIdentityDocument({
      uri: asset.uri,
      mime:
        asset.mimeType ??
        (ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`),
      name: asset.name ?? `identity.${ext}`,
      isPdf: ext === 'pdf',
    });
  };

  // ── Bank input handlers ──────────────────────────────────────────
  const onBankAccountNumberChange = (text: string) => {
    setBankAccountNumber(text.replace(/\D/g, '').slice(0, 20));
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
    setPriceText(next.toFixed(2));
  };
  const onPriceChange = (text: string) => {
    // Keep digits and a single decimal point, capped at 2 decimal places.
    let cleaned = text.replace(/[^0-9.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned
          .slice(firstDot + 1)
          .replace(/\./g, '')
          .slice(0, 2);
    }
    setPriceText(cleaned);
  };
  const onPriceBlur = () => {
    if (priceText.trim() === '') return;
    // Always land on a proper 2-decimal price so "26" becomes "26.00" and
    // "26.9" becomes "26.90" — matches how prices are shown everywhere else.
    setPriceText(priceNum.toFixed(2));
  };

  // ── Final commit ─────────────────────────────────────────────────
  const submit = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to submit your application.');
      return;
    }
    if (!complianceAccepted) {
      Alert.alert(
        'Acknowledgement required',
        'Return to the food-safety step and accept the current compliance terms.'
      );
      return;
    }
    if (!citizenshipType || !identityDocument) {
      Alert.alert('Identity required', 'Upload your MyKad or MyPR before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const publicRestaurantArea =
        restaurantDiscoveryLocation ??
        (await geocodeRestaurantAddress(
          [addr.street, addr.locality, addr.postcode, addr.town, addr.country]
            .filter(Boolean)
            .join(', ')
        ));
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileErr || !profile) throw new Error('Profile not found for your account.');

      // Fail before creating a listing or uploading documents if the
      // immutable acceptance cannot be recorded.
      await recordFoodComplianceAcceptance(user.id, 'start_restaurant');

      // Identity evidence is stored separately from ordinary food-safety files.
      const identityExt = identityDocument.name.split('.').pop()?.toLowerCase() ?? 'pdf';
      const identityType = citizenshipType === 'malaysian_citizen' ? 'mykad' : 'mypr';
      const identityPath = `${user.id}/${identityType}-${Date.now()}.${identityExt}`;
      const identityResponse = await fetch(identityDocument.uri);
      const identityBuffer = await identityResponse.arrayBuffer();
      const { error: identityUploadError } = await supabase.storage
        .from(IDENTITY_BUCKET)
        .upload(identityPath, identityBuffer, {
          contentType: identityDocument.mime,
          upsert: false,
        });
      if (identityUploadError) throw identityUploadError;

      // 1. Upload dish photo
      let dishImageUrl: string | null = photoUri?.startsWith('http') ? photoUri : null;
      if (photoUri) {
        if (photoUri.startsWith('http')) {
          dishImageUrl = photoUri;
        } else {
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
      }

      // 2. Insert an inactive draft. It remains private until both the cook
      // application and the dish itself have been approved.
      const listingPayload = {
        cook_id: profile.id,
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        image_url: dishImageUrl,
        cuisine,
        dietary_tags: dietaryTags,
        ingredients: ingredientsList,
        location: addr.locality.trim() || null,
        is_active: false,
        status: 'pending',
      };
      const { error: listingError } = resubmitListingId
        ? await supabase.from('listings').update(listingPayload).eq('id', resubmitListingId)
        : await supabase.from('listings').insert(listingPayload);
      if (listingError) throw listingError;

      // 3. Upload any optional food/business credentials the cook supplied.
      const docEntries = Object.entries(verificationDocs) as [
        VerificationDocType,
        { uri: string; mime: string; name: string; isPdf: boolean },
      ][];
      let certificatePath: string | null = null;
      for (const [docType, asset] of docEntries) {
        const ext = asset.name.split('.').pop()?.toLowerCase() ?? 'pdf';
        const path = `${user.id}/${docType}-${Date.now()}.${ext}`;
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from(FOOD_SAFETY_BUCKET)
          .upload(path, arrayBuffer, { contentType: asset.mime, upsert: false });
        if (uploadErr) throw uploadErr;

        const { error: docErr } = await supabase.from('verification_documents').insert({
          user_id: user.id,
          doc_type: docType,
          storage_path: path,
          status: 'pending',
        });
        if (docErr) throw docErr;
        if (docType === 'food_handler_certificate') certificatePath = path;
      }

      // 4. Update profile (address + food safety). The legacy license columns
      // stay populated so older read paths keep working.
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
          restaurant_name: restaurantName.trim(),
          hosting_type: hostingType,
          has_food_safety_license: certificatePath != null,
          food_safety_license_url: certificatePath,
          bank_name: bankName.trim(),
          bank_account_name: bankAccountName.trim(),
          bank_account_number: bankAccountNumber,
        })
        .eq('user_id', user.id);
      if (profileUpdateErr) throw profileUpdateErr;

      await saveRestaurantDiscoveryLocation(session?.access_token, publicRestaurantArea);

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/cook-applications/submit`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${
              (await supabase.auth.getSession()).data.session?.access_token
            }`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            citizenshipType,
            documentType: identityType,
            identityStoragePath: identityPath,
          }),
        }
      );
      const applicationPayload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok)
        throw new Error(applicationPayload.error ?? 'Application submission failed.');

      // 5. Grant the cook role (admin will revoke this if the application is
      // rejected later). Idempotent — skip if a row already exists, e.g. the
      // cook is resubmitting after an earlier abandoned attempt.
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'cook')
        .maybeSingle();
      if (!existingRole) {
        const { error: roleErr } = await supabase
          .from('user_roles')
          .insert({ user_id: user.id, role: 'cook' });
        if (roleErr) throw roleErr;
      }

      Alert.alert(
        'Application submitted!',
        "Welcome to your restricted cook dashboard. You can create draft dishes while your identity review is pending. Optional food-safety documents only add credentials; they do not block approval. Drafts won't be visible or orderable until your cook application and each dish are approved.",
        [{ text: 'Explore dashboard', onPress: () => router.replace('/(cook)/(tabs)/menu') }]
      );
    } catch (e: any) {
      if (e instanceof RestaurantLocationError || e?.name === 'RestaurantLocationError') {
        setAddressLocationError(e.message);
        setStepIdx(STEPS.indexOf('address'));
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: 0, animated: true });
          addressSearchRef.current?.focus();
        }, 250);
        return;
      }
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
              submitBehavior="newline"
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
              submitBehavior="newline"
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
              submitBehavior="newline"
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
                onChangeText={onPriceChange}
                onBlur={onPriceBlur}
                keyboardType="decimal-pad"
                inputMode="decimal"
                selectTextOnFocus
              />
              <Ionicons name="pencil" size={20} color="#888" style={styles.priceEditIcon} />
            </View>
            <Text style={styles.priceEditHint}>Tap the price to edit it</Text>
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
            <View style={[styles.searchWrap, addressLocationError && styles.searchWrapError]}>
              <Ionicons name="search" size={18} color="#888" />
              <TextInput
                ref={addressSearchRef}
                style={styles.searchInput}
                value={addrSearchQuery}
                onChangeText={text => {
                  setAddrSearchQuery(text);
                  setAddressLocationError(null);
                }}
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
            {addressLocationError && (
              <View style={styles.locationErrorRow}>
                <Ionicons name="alert-circle" size={18} color="#C62828" />
                <Text style={styles.locationErrorText}>{addressLocationError}</Text>
              </View>
            )}

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
              { key: 'street', label: 'House No. & Street Name', required: true },
              { key: 'flat', label: 'Unit No.', required: false },
              { key: 'property_name', label: 'Building name', required: false },
              { key: 'locality', label: 'Area / Taman', required: false },
              { key: 'postcode', label: 'Postcode', required: true, numeric: true },
              { key: 'town', label: 'City', required: true },
              { key: 'country', label: 'State / Country', required: true },
            ].map(({ key, label, required, numeric }) => {
              const value = (addr as any)[key] as string;
              const showWarning = required && value.trim() === '';
              return (
                <View key={key} style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>
                    {label} {required && <Text style={styles.requiredAsterisk}>*</Text>}
                  </Text>
                  <TextInput
                    style={[styles.fieldInput, showWarning && styles.fieldInputWarning]}
                    value={value}
                    onChangeText={text => {
                      setAddr(prev => ({ ...prev, [key]: text }));
                      if (['street', 'locality', 'postcode', 'town', 'country'].includes(key)) {
                        setRestaurantDiscoveryLocation(null);
                        setAddressLocationError(null);
                      }
                    }}
                    placeholder={required ? '' : '(optional)'}
                    placeholderTextColor="#bbb"
                    keyboardType={numeric ? 'number-pad' : 'default'}
                    autoCapitalize="words"
                  />
                  {showWarning && (
                    <Text style={styles.warningText}>This field is required to continue.</Text>
                  )}
                </View>
              );
            })}
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
            <View style={styles.tierCallout}>
              <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
              <View style={{ flex: 1 }}>
                <Text style={styles.tierCalloutTitle}>Optional food-safety credentials</Text>
                <Text style={styles.tierCalloutBody}>
                  You can continue without uploading anything. Submit any documents you have for
                  review now, or add them later from your cook account to earn credential badges.
                </Text>
              </View>
            </View>
            <FoodComplianceAcknowledgement
              accepted={complianceAccepted}
              onAcceptedChange={setComplianceAccepted}
              acceptedAt={complianceAcceptedAt}
            />
            {TIER1_DOCUMENTS.map(doc => {
              const asset = verificationDocs[doc.type];
              return (
                <View key={doc.type} style={styles.uploadWrap}>
                  <Text style={styles.fsQuestion}>{doc.title}</Text>
                  <Text style={styles.fsHint}>{doc.subtitle}</Text>
                  <TouchableOpacity
                    style={styles.uploadBox}
                    onPress={() => pickVerificationDoc(doc.type)}
                    activeOpacity={0.7}
                  >
                    {asset ? (
                      asset.isPdf ? (
                        <View style={styles.pdfBadge}>
                          <Ionicons name="document-text-outline" size={32} color="#1A1A1A" />
                          <Text style={styles.pdfBadgeText} numberOfLines={1}>
                            {asset.name}
                          </Text>
                          <Text style={styles.pdfBadgeHint}>Tap to replace</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: asset.uri }} style={styles.uploadPreview} />
                      )
                    ) : (
                      <View style={styles.pdfBadge}>
                        <Ionicons name="add" size={32} color="#888" />
                        <Text style={styles.pdfBadgeHint}>Upload a photo, scan or PDF</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {asset && (
                    <TouchableOpacity onPress={() => removeVerificationDoc(doc.type)}>
                      <Text style={styles.removeDocText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        );

      case 'identity':
        return (
          <>
            <Text style={styles.fsQuestion}>Residency status</Text>
            <RadioRow
              title="Malaysian citizen"
              subtitle="Upload your MyKad"
              selected={citizenshipType === 'malaysian_citizen'}
              onPress={() => {
                setCitizenshipType('malaysian_citizen');
                setIdentityDocument(null);
              }}
            />
            <RadioRow
              title="Malaysian permanent resident"
              subtitle="Upload your MyPR"
              selected={citizenshipType === 'permanent_resident'}
              onPress={() => {
                setCitizenshipType('permanent_resident');
                setIdentityDocument(null);
              }}
            />
            <View style={styles.tierCallout}>
              <Ionicons name="lock-closed-outline" size={20} color="#237A3B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.tierCalloutTitle}>Private identity review</Text>
                <Text style={styles.tierCalloutBody}>
                  Your document is not public. Only administrators with identity-review permission
                  can open a short-lived secure link, and each access is logged.
                </Text>
              </View>
            </View>
            {citizenshipType && (
              <View style={styles.uploadWrap}>
                <Text style={styles.fsQuestion}>
                  {citizenshipType === 'malaysian_citizen' ? 'MyKad' : 'MyPR'}
                </Text>
                <Text style={styles.fsHint}>Upload a clear scan or photo. Maximum 10 MB.</Text>
                <TouchableOpacity style={styles.uploadBox} onPress={pickIdentityDocument}>
                  {identityDocument ? (
                    identityDocument.isPdf ? (
                      <View style={styles.pdfBadge}>
                        <Ionicons name="document-lock-outline" size={32} color="#1A1A1A" />
                        <Text style={styles.pdfBadgeText}>{identityDocument.name}</Text>
                        <Text style={styles.pdfBadgeHint}>Tap to replace</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: identityDocument.uri }} style={styles.uploadPreview} />
                    )
                  ) : (
                    <View style={styles.pdfBadge}>
                      <Ionicons name="add" size={32} color="#888" />
                      <Text style={styles.pdfBadgeHint}>Upload a photo, scan or PDF</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        );

      case 'payment':
        return (
          <View style={{ gap: 14 }}>
            <View>
              <Text style={styles.fieldLabel}>BANK NAME</Text>
              <BankSelect value={bankName} onChange={setBankName} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>BANK ACCOUNT NAME</Text>
              <View style={styles.cardInputWrapper}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color="#666"
                  style={{ marginRight: 10 }}
                />
                <TextInput
                  ref={bankAccountNameRef}
                  placeholder="Full name as registered with your bank"
                  style={{ flex: 1, fontSize: 16 }}
                  value={bankAccountName}
                  onChangeText={setBankAccountName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => bankAccountNumberRef.current?.focus()}
                />
              </View>
            </View>
            <View>
              <Text style={styles.fieldLabel}>BANK ACCOUNT NUMBER</Text>
              <View style={styles.cardInputWrapper}>
                <Ionicons
                  name="keypad-outline"
                  size={20}
                  color="#666"
                  style={{ marginRight: 10 }}
                />
                <TextInput
                  ref={bankAccountNumberRef}
                  placeholder="e.g. 1122334455"
                  style={{ flex: 1, fontSize: 16 }}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={bankAccountNumber}
                  onChangeText={onBankAccountNumberChange}
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={handleNext}
                />
              </View>
            </View>
            <Text style={styles.disclaimer}>
              Double-check your account number — payouts to a wrong account can&apos;t be recalled.
            </Text>
          </View>
        );
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  const heading = STEP_HEADINGS[step];
  const advanceLabel = isLast
    ? 'Submit application'
    : step === 'food-safety'
      ? complianceAcceptedAt
        ? 'Continue'
        : 'Agree & continue'
      : 'Next';

  if (loadingExistingApplication) {
    return (
      <SafeAreaView style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading your application…</Text>
      </SafeAreaView>
    );
  }

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
          ref={scrollRef}
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
  priceEditIcon: { marginLeft: 8, alignSelf: 'center' },
  priceEditHint: { fontSize: 12, color: '#888', marginTop: 8, fontWeight: '500' },
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
  searchWrapError: { borderWidth: 2, borderColor: '#C62828', backgroundColor: '#FFF5F5' },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A' },
  locationErrorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  locationErrorText: { flex: 1, color: '#C62828', fontSize: 13, lineHeight: 18, fontWeight: '700' },
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
  requiredAsterisk: { color: '#FF5252' },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
  },
  fieldInputWarning: { borderColor: '#FFB74D', backgroundColor: '#FFF8E1' },
  warningText: { color: '#B26B00', fontSize: 12, marginTop: 2, marginLeft: 4 },
  loadingContainer: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#666', fontSize: 14, fontWeight: '600' },

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
  tierCallout: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  tierCalloutTitle: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  tierCalloutBody: { fontSize: 12, color: '#555', lineHeight: 17 },
  removeDocText: {
    fontSize: 13,
    color: '#FF5252',
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: -2,
    marginBottom: 6,
  },

  cardInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
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
