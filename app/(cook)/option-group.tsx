import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/src/services/auth-context';
import { supabase } from '@/src/utils/supabaseClient';

type SelectionType = 'single' | 'multiple';
type DraftOption = {
  key: string;
  id?: string;
  name: string;
  charge: boolean;
  price: string;
};
type Dish = { id: string; title: string; image_url: string | null; status: string };
type ExistingGroup = {
  id: string;
  name: string;
  selection_type: SelectionType;
  min_select: number;
  max_select: number;
  menu_options: Array<{ id: string; name: string; price_delta: number | string }>;
  listing_option_groups: Array<{ listing_id: string }>;
};

const STEPS = ['Group details', 'Options', 'Link dishes', 'Review'];
const apiUrl = () => process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const blankOption = (): DraftOption => ({ key: newKey(), name: '', charge: false, price: '' });

export default function OptionGroupEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; step?: string | string[] }>();
  const groupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialStep = Number(Array.isArray(params.step) ? params.step[0] : params.step);
  const { user, session } = useAuth();

  const [step, setStep] = useState(
    Number.isInteger(initialStep) ? Math.min(3, Math.max(0, initialStep)) : 0
  );
  const [loading, setLoading] = useState(Boolean(groupId));
  const [saving, setSaving] = useState(false);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [name, setName] = useState('');
  const [required, setRequired] = useState(true);
  const [selectionType, setSelectionType] = useState<SelectionType>('single');
  const [minSelect, setMinSelect] = useState('1');
  const [maxSelect, setMaxSelect] = useState('1');
  const [options, setOptions] = useState<DraftOption[]>([blankOption()]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());

  const headers = useMemo(
    () => ({
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    }),
    [session?.access_token]
  );

  const load = useCallback(async () => {
    if (!user || !session?.access_token) return;
    setLoading(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (profileError || !profile) throw profileError ?? new Error('Cook profile not found.');
      const [{ data: dishRows, error: dishesError }, groupsResponse] = await Promise.all([
        supabase
          .from('listings')
          .select('id, title, image_url, status')
          .eq('cook_id', profile.id)
          .order('title'),
        groupId
          ? fetch(`${apiUrl()}/api/cook-menu/option-groups`, { headers })
          : Promise.resolve(null),
      ]);
      if (dishesError) throw dishesError;
      setDishes((dishRows ?? []) as Dish[]);

      if (groupsResponse) {
        const payload = (await groupsResponse.json().catch(() => ({}))) as {
          error?: string;
          groups?: ExistingGroup[];
        };
        if (!groupsResponse.ok)
          throw new Error(payload.error ?? 'Option group could not be loaded.');
        const group = payload.groups?.find(item => item.id === groupId);
        if (!group) throw new Error('Option group not found.');
        setName(group.name);
        setRequired(group.min_select > 0);
        setSelectionType(group.selection_type);
        setMinSelect(String(group.min_select || 1));
        setMaxSelect(String(group.max_select));
        setOptions(
          group.menu_options.map(option => ({
            key: option.id,
            id: option.id,
            name: option.name,
            charge: Number(option.price_delta) > 0,
            price: Number(option.price_delta) > 0 ? Number(option.price_delta).toFixed(2) : '',
          }))
        );
        setLinkedIds(new Set(group.listing_option_groups.map(link => link.listing_id)));
      }
    } catch (error: unknown) {
      Alert.alert(
        'Could not load option group',
        error instanceof Error ? error.message : 'Try again.'
      );
      if (groupId) router.back();
    } finally {
      setLoading(false);
    }
  }, [groupId, headers, router, session?.access_token, user]);

  useEffect(() => {
    load();
  }, [load]);

  const updateOption = (key: string, patch: Partial<DraftOption>) => {
    setOptions(current =>
      current.map(option => (option.key === key ? { ...option, ...patch } : option))
    );
  };

  const setType = (type: SelectionType) => {
    setSelectionType(type);
    if (type === 'single') {
      setMinSelect(required ? '1' : '0');
      setMaxSelect('1');
    } else {
      setMinSelect(required ? '1' : '0');
      setMaxSelect(String(Math.max(1, options.length)));
    }
  };

  const clampLimitsToOptionCount = (count: number) => {
    if (selectionType === 'single') return;
    setMaxSelect(current => {
      const max = Number(current);
      if (!Number.isInteger(max) || max > count) return String(Math.max(1, count));
      return current;
    });
    setMinSelect(current => {
      const min = Number(current);
      if (!Number.isInteger(min) || min > count) return String(Math.max(0, count));
      return current;
    });
  };

  const setRequirement = (next: boolean) => {
    setRequired(next);
    setMinSelect(next ? '1' : '0');
  };

  const validateStep = (current: number): boolean => {
    if (current === 0 && (name.trim().length < 2 || name.trim().length > 100)) {
      Alert.alert('Check group name', 'Enter a name between 2 and 100 characters.');
      return false;
    }
    if (current === 1) {
      if (options.length === 0 || options.some(option => !option.name.trim())) {
        Alert.alert('Add options', 'Every option needs a name.');
        return false;
      }
      const normalized = options.map(option => option.name.trim().toLocaleLowerCase('en-MY'));
      if (new Set(normalized).size !== normalized.length) {
        Alert.alert('Duplicate options', 'Each option in the group needs a unique name.');
        return false;
      }
      if (
        options.some(option => {
          if (!option.charge) return false;
          const price = Number(option.price);
          return !Number.isFinite(price) || price <= 0;
        })
      ) {
        Alert.alert('Check surcharges', 'Charged options need an amount greater than RM 0.00.');
        return false;
      }
      const min =
        selectionType === 'single' ? (required ? 1 : 0) : required ? Number(minSelect) : 0;
      const max = selectionType === 'single' ? 1 : Number(maxSelect);
      if (!Number.isInteger(min) || !Number.isInteger(max)) {
        Alert.alert(
          'Check selection limits',
          'Minimum and maximum selections must be whole numbers.'
        );
        return false;
      }
      if (max < 1) {
        Alert.alert('Check selection limits', 'Maximum selections must be at least 1.');
        return false;
      }
      if (min < 0) {
        Alert.alert('Check selection limits', 'Minimum selections cannot be negative.');
        return false;
      }
      if (max < min) {
        Alert.alert(
          'Check selection limits',
          'Maximum selections cannot be less than minimum selections.'
        );
        return false;
      }
      if (max > options.length) {
        Alert.alert(
          'Too many options required',
          `You've set a maximum of ${max}, but only ${options.length} option${
            options.length === 1 ? '' : 's'
          } exist. Add more options or lower the maximum above.`
        );
        return false;
      }
    }
    if (current === 2 && linkedIds.size === 0) {
      Alert.alert(
        'Link at least one dish',
        'Choose which dishes should display this option group.'
      );
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep(current => Math.min(3, current + 1));
  };

  const save = async () => {
    if (![0, 1, 2].every(validateStep) || saving) return;
    setSaving(true);
    try {
      const response = await fetch(
        `${apiUrl()}/api/cook-menu/option-groups${groupId ? `/${groupId}` : ''}`,
        {
          method: groupId ? 'PUT' : 'POST',
          headers,
          body: JSON.stringify({
            name: name.trim(),
            required,
            selectionType,
            minSelect:
              selectionType === 'single' ? (required ? 1 : 0) : required ? Number(minSelect) : 0,
            maxSelect: selectionType === 'single' ? 1 : Number(maxSelect),
            options: options.map(option => ({
              ...(option.id ? { id: option.id } : {}),
              name: option.name.trim(),
              priceDelta: option.charge ? Number(option.price) : 0,
            })),
            listingIds: [...linkedIds],
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Option group could not be saved.');
      Alert.alert(
        groupId ? 'Option group updated' : 'Option group created',
        `Customers will see it on ${linkedIds.size} linked dish${linkedIds.size === 1 ? '' : 'es'}.`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (error: unknown) {
      Alert.alert('Option group not saved', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator size="large" color="#26A950" />
      </SafeAreaView>
    );
  }

  const renderDetails = () => (
    <View style={styles.section}>
      <Text style={styles.label}>GROUP NAME *</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Drink"
        style={styles.input}
        maxLength={100}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={Keyboard.dismiss}
      />
      <Text style={styles.fieldTitle}>Is a choice required?</Text>
      <View style={styles.segmentRow}>
        <Choice selected={required} label="Required" onPress={() => setRequirement(true)} />
        <Choice selected={!required} label="Optional" onPress={() => setRequirement(false)} />
      </View>
    </View>
  );

  const renderOptions = () => (
    <View style={styles.section}>
      <Text style={styles.helper}>
        Add the choices customers will see. Each choice can be free or carry a surcharge.
      </Text>
      {options.map((option, index) => (
        <View key={option.key} style={styles.optionCard}>
          <View style={styles.optionHeader}>
            <Text style={styles.optionNumber}>Option {index + 1}</Text>
            {options.length > 1 ? (
              <TouchableOpacity
                onPress={() => {
                  setOptions(current => current.filter(row => row.key !== option.key));
                  clampLimitsToOptionCount(options.length - 1);
                }}
              >
                <Ionicons name="trash-outline" size={21} color="#D14D4D" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
            value={option.name}
            onChangeText={value => updateOption(option.key, { name: value })}
            placeholder="e.g. Iced lemon tea"
            placeholderTextColor="#8A9490"
            style={styles.input}
            maxLength={100}
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={Keyboard.dismiss}
          />
          <View style={styles.chargeRow}>
            <View style={styles.chargeCopy}>
              <Text style={styles.chargeTitle}>Charge an additional surcharge</Text>
              <Text style={styles.chargeHint}>
                Leave off when this choice is included in the base price.
              </Text>
            </View>
            <Switch
              value={option.charge}
              onValueChange={charge =>
                updateOption(option.key, { charge, price: charge ? option.price : '' })
              }
              trackColor={{ false: '#D9DEDB', true: '#8CDDA6' }}
              ios_backgroundColor="#D9DEDB"
              thumbColor={option.charge ? '#20A84F' : '#FFFFFF'}
            />
          </View>
          {option.charge ? (
            <View style={styles.priceRow}>
              <Text style={styles.currency}>RM</Text>
              <TextInput
                value={option.price}
                onChangeText={value =>
                  updateOption(option.key, { price: value.replace(/[^0-9.]/g, '') })
                }
                placeholder="0.00"
                style={[styles.input, styles.priceInput]}
                keyboardType="decimal-pad"
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          ) : null}
        </View>
      ))}
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setOptions(current => [...current, blankOption()])}
      >
        <Ionicons name="add" size={22} color="#1473E6" />
        <Text style={styles.secondaryButtonText}>Add another option</Text>
      </TouchableOpacity>
      <Text style={styles.fieldTitle}>How can customers choose?</Text>
      <View style={styles.segmentRow}>
        <Choice
          selected={selectionType === 'single'}
          label="Pick one"
          onPress={() => setType('single')}
        />
        <Choice
          selected={selectionType === 'multiple'}
          label="Pick multiple"
          onPress={() => setType('multiple')}
        />
      </View>
      {selectionType === 'multiple' ? (
        <View style={styles.limitRow}>
          {required ? (
            <View style={styles.limitField}>
              <Text style={styles.label}>MINIMUM</Text>
              <TextInput
                value={minSelect}
                onChangeText={value => setMinSelect(value.replace(/[^0-9]/g, ''))}
                style={styles.input}
                keyboardType="number-pad"
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          ) : null}
          <View style={styles.limitField}>
            <Text style={styles.label}>MAXIMUM</Text>
            <TextInput
              value={maxSelect}
              onChangeText={value => setMaxSelect(value.replace(/[^0-9]/g, ''))}
              style={styles.input}
              keyboardType="number-pad"
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </View>
      ) : null}
      <Text style={styles.helper}>
        {`Choose up to ${options.length} option${options.length === 1 ? '' : 's'} for this group.`}
      </Text>
    </View>
  );

  const renderLinks = () => (
    <View style={styles.section}>
      <Text style={styles.helper}>Choose the dishes that should show this reusable group.</Text>
      {dishes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Create a dish before linking an option group.</Text>
        </View>
      ) : (
        dishes.map(dish => {
          const selected = linkedIds.has(dish.id);
          return (
            <TouchableOpacity
              key={dish.id}
              style={styles.dishRow}
              onPress={() =>
                setLinkedIds(current => {
                  const nextSet = new Set(current);
                  if (nextSet.has(dish.id)) nextSet.delete(dish.id);
                  else nextSet.add(dish.id);
                  return nextSet;
                })
              }
            >
              {dish.image_url ? (
                <Image source={{ uri: dish.image_url }} style={styles.dishImage} />
              ) : (
                <View style={[styles.dishImage, styles.imagePlaceholder]}>
                  <Ionicons name="restaurant-outline" size={20} color="#98A19B" />
                </View>
              )}
              <View style={styles.dishCopy}>
                <Text style={styles.dishTitle}>{dish.title}</Text>
                <Text style={styles.dishStatus}>{dish.status}</Text>
              </View>
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={27}
                color={selected ? '#20A84F' : '#B8BFBA'}
              />
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  const rule =
    selectionType === 'single'
      ? `${required ? 'Required' : 'Optional'} · Pick 1`
      : `${required ? 'Required' : 'Optional'} · ${required ? `Pick ${minSelect}–${maxSelect}` : `Pick up to ${maxSelect}`}`;
  const renderReview = () => (
    <View style={styles.section}>
      <View style={styles.reviewCard}>
        <Text style={styles.reviewEyebrow}>OPTION GROUP</Text>
        <Text style={styles.reviewTitle}>{name.trim()}</Text>
        <Text style={styles.reviewRule}>{rule}</Text>
      </View>
      <Text style={styles.reviewHeading}>Customer choices</Text>
      {options.map(option => (
        <View key={option.key} style={styles.reviewRow}>
          <Text style={styles.reviewOption}>{option.name.trim()}</Text>
          <Text style={styles.reviewPrice}>
            {option.charge ? `+RM ${Number(option.price).toFixed(2)}` : 'Included'}
          </Text>
        </View>
      ))}
      <Text style={styles.reviewHeading}>Linked dishes · {linkedIds.size}</Text>
      <Text style={styles.linkedNames}>
        {dishes
          .filter(dish => linkedIds.has(dish.id))
          .map(dish => dish.title)
          .join(', ')}
      </Text>
      <Text style={styles.snapshotNote}>
        Orders keep a snapshot of selected choices and prices, even if this group changes later.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => (step === 0 ? router.back() : setStep(current => current - 1))}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={27} color="#202622" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>
              {groupId ? 'Edit option group' : 'Create option group'}
            </Text>
            <Text style={styles.headerStep}>
              Step {step + 1} of 4 · {STEPS[step]}
            </Text>
          </View>
        </View>
        <View style={styles.progress}>
          {STEPS.map((_, index) => (
            <View
              key={index}
              style={[styles.progressBar, index <= step && styles.progressBarActive]}
            />
          ))}
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0
            ? renderDetails()
            : step === 1
              ? renderOptions()
              : step === 2
                ? renderLinks()
                : renderReview()}
        </ScrollView>
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={step === 3 ? save : next}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>
                {step === 3 ? 'Save option group' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choice({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.choice, selected && styles.choiceSelected]} onPress={onPress}>
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={22}
        color={selected ? '#20A84F' : '#ABB3AE'}
      />
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  headerTitle: { fontFamily: 'mon-b', fontSize: 22, color: '#202622' },
  headerStep: { marginTop: 2, fontFamily: 'mon', fontSize: 12, color: '#7B847E' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingBottom: 12 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E5E9E6' },
  progressBarActive: { backgroundColor: '#27AF53' },
  content: { padding: 22, paddingBottom: 34 },
  section: { gap: 16 },
  label: { fontFamily: 'mon-sb', fontSize: 11, letterSpacing: 0.7, color: '#68716B' },
  input: {
    minHeight: 52,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#D5DBD7',
    borderRadius: 14,
    fontFamily: 'mon',
    fontSize: 15,
    color: '#232A26',
    backgroundColor: '#FFFFFF',
  },
  fieldTitle: { marginTop: 7, fontFamily: 'mon-sb', fontSize: 16, color: '#27302A' },
  segmentRow: { flexDirection: 'row', gap: 10 },
  choice: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D7DDD9',
    borderRadius: 14,
  },
  choiceSelected: { borderColor: '#39B962', backgroundColor: '#F0FBF3' },
  choiceText: { fontFamily: 'mon-sb', fontSize: 14, color: '#69726C' },
  choiceTextSelected: { color: '#247D3D' },
  limitRow: { flexDirection: 'row', gap: 12 },
  limitField: { flex: 1, gap: 7 },
  helper: { fontFamily: 'mon', fontSize: 14, lineHeight: 21, color: '#6D7670' },
  optionCard: {
    gap: 13,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DFE4E1',
    borderRadius: 17,
    backgroundColor: '#FBFCFB',
  },
  optionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionNumber: { fontFamily: 'mon-b', fontSize: 14, color: '#3B443E' },
  chargeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chargeCopy: { flex: 1 },
  chargeTitle: { fontFamily: 'mon-sb', fontSize: 13, color: '#303833' },
  chargeHint: { marginTop: 3, fontFamily: 'mon', fontSize: 11, lineHeight: 16, color: '#7D857F' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  currency: { fontFamily: 'mon-b', fontSize: 15, color: '#3F4842' },
  priceInput: { flex: 1 },
  secondaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#CFE0F4',
    borderRadius: 14,
  },
  secondaryButtonText: { fontFamily: 'mon-sb', fontSize: 14, color: '#1473E6' },
  dishRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 11,
    borderWidth: 1,
    borderColor: '#E0E5E2',
    borderRadius: 15,
  },
  dishImage: { width: 50, height: 50, borderRadius: 10 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF2F0' },
  dishCopy: { flex: 1 },
  dishTitle: { fontFamily: 'mon-sb', fontSize: 14, color: '#2B332E' },
  dishStatus: {
    marginTop: 3,
    fontFamily: 'mon',
    fontSize: 11,
    textTransform: 'capitalize',
    color: '#858D88',
  },
  empty: { padding: 22, borderRadius: 16, backgroundColor: '#F4F6F4' },
  emptyText: { textAlign: 'center', fontFamily: 'mon', color: '#747D77' },
  reviewCard: { padding: 20, borderRadius: 18, backgroundColor: '#EFFAF2' },
  reviewEyebrow: { fontFamily: 'mon-b', fontSize: 10, letterSpacing: 0.8, color: '#4A7957' },
  reviewTitle: { marginTop: 7, fontFamily: 'mon-b', fontSize: 24, color: '#1F2B23' },
  reviewRule: { marginTop: 7, fontFamily: 'mon-sb', fontSize: 13, color: '#288247' },
  reviewHeading: { marginTop: 7, fontFamily: 'mon-b', fontSize: 16, color: '#29312C' },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFEC',
  },
  reviewOption: { flex: 1, fontFamily: 'mon', fontSize: 14, color: '#3A433D' },
  reviewPrice: { fontFamily: 'mon-sb', fontSize: 13, color: '#59635D' },
  linkedNames: { fontFamily: 'mon', fontSize: 14, lineHeight: 21, color: '#606A63' },
  snapshotNote: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    fontFamily: 'mon',
    fontSize: 12,
    lineHeight: 18,
    color: '#66716A',
    backgroundColor: '#F4F6F4',
  },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#ECEFEC', backgroundColor: '#FFFFFF' },
  primaryButton: {
    minHeight: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#22AE50',
  },
  primaryText: { fontFamily: 'mon-b', fontSize: 16, color: '#FFFFFF' },
  disabled: { opacity: 0.55 },
});
