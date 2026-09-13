import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  SERVICE_REGIONS,
  type LocationCandidate,
  type ServiceRegionId,
} from '@/src/constants/serviceRegions';
import {
  formatCustomerOrderTime,
  useCustomerLocation,
  type RecentCustomerLocation,
  type SavedCustomerLocation,
} from '@/src/context/CustomerLocationContext';
import { getLocalDateKey } from '@/src/utils/listingAvailability';

type PickerView = 'summary' | 'location' | 'region' | 'time';
type LocationTab = 'recent' | 'suggested' | 'saved';

interface LocationPromptModalProps {
  visible: boolean;
  onClose: () => void;
  initialView?: Extract<PickerView, 'summary' | 'location'>;
}

const MALAYSIA_UTC_OFFSET = '+08:00';

const addDays = (serviceDate: string, days: number): string => {
  const [year, month, day] = serviceDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const getScheduleDays = (now = new Date()) => {
  const today = getLocalDateKey(now);
  return Array.from({ length: 3 }, (_, index) => {
    const serviceDate = addDays(today, index);
    const date = new Date(`${serviceDate}T12:00:00${MALAYSIA_UTC_OFFSET}`);
    return {
      serviceDate,
      label:
        index === 0
          ? 'Today'
          : new Intl.DateTimeFormat('en-MY', {
              timeZone: 'Asia/Kuala_Lumpur',
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(date),
    };
  });
};

const getTimeSlots = (serviceDate: string, now = new Date()) => {
  const slots: Array<{ value: string; label: string }> = [];
  for (let hour = 7; hour <= 21; hour += 1) {
    for (const minute of [0, 30]) {
      if (hour === 21 && minute === 30) continue;
      const paddedHour = String(hour).padStart(2, '0');
      const paddedMinute = String(minute).padStart(2, '0');
      const date = new Date(
        `${serviceDate}T${paddedHour}:${paddedMinute}:00${MALAYSIA_UTC_OFFSET}`
      );
      if (date.getTime() <= now.getTime() + 30 * 60_000) continue;
      slots.push({
        value: date.toISOString(),
        label: new Intl.DateTimeFormat('en-MY', {
          timeZone: 'Asia/Kuala_Lumpur',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
          .format(date)
          .replace(/\b(am|pm)\b/i, period => period.toUpperCase()),
      });
    }
  }
  return slots;
};

const compactLocationLabel = (label: string): string =>
  label
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');

export default function LocationPromptModal({
  visible,
  onClose,
  initialView = 'summary',
}: LocationPromptModalProps) {
  const {
    location,
    region,
    recentLocations,
    savedLocations,
    fulfillmentPreference,
    orderTimePreference,
    saving,
    error,
    selectCurrentLocation,
    selectLocation,
    selectRegion,
    searchLocations,
    saveNamedLocation,
    removeSavedLocation,
    setFulfillmentPreference,
    setOrderTimePreference,
    dismissPrompt,
    clearError,
  } = useCustomerLocation();
  const [view, setView] = useState<PickerView>(initialView);
  const [activeTab, setActiveTab] = useState<LocationTab>('recent');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<LocationCandidate[]>([]);
  const [pickerOpenedAt, setPickerOpenedAt] = useState(() => new Date());
  const scheduleDays = useMemo(() => getScheduleDays(pickerOpenedAt), [pickerOpenedAt]);
  const initialScheduledDate =
    orderTimePreference.mode === 'scheduled'
      ? getLocalDateKey(new Date(orderTimePreference.scheduledAt))
      : scheduleDays[0]?.serviceDate;
  const [activeScheduleDate, setActiveScheduleDate] = useState(
    initialScheduledDate ?? getLocalDateKey()
  );
  const timeSlots = useMemo(
    () => getTimeSlots(activeScheduleDate, pickerOpenedAt),
    [activeScheduleDate, pickerOpenedAt]
  );

  useEffect(() => {
    if (!visible) return;
    setPickerOpenedAt(new Date());
    setView(initialView);
    setActiveTab('recent');
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
    setActiveScheduleDate(initialScheduledDate ?? getLocalDateKey());
    clearError();
  }, [clearError, initialScheduledDate, initialView, visible]);

  useEffect(() => {
    if (!visible || view !== 'location' || query.trim().length < 3) {
      setSearching(false);
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    let current = true;
    setSearching(true);
    setSearchError(null);
    const timeout = setTimeout(() => {
      searchLocations(query, region.id)
        .then(results => {
          if (!current) return;
          setSearchResults(results);
          if (results.length === 0) setSearchError(`No matching areas found in ${region.name}.`);
        })
        .catch(caught => {
          if (current) {
            setSearchResults([]);
            setSearchError(caught instanceof Error ? caught.message : 'Location search failed.');
          }
        })
        .finally(() => {
          if (current) setSearching(false);
        });
    }, 450);
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [query, region.id, region.name, searchLocations, view, visible]);

  const close = async () => {
    if (!location) await dismissPrompt();
    onClose();
  };

  const chooseCurrentLocation = async () => {
    if (await selectCurrentLocation()) setView('summary');
  };

  const chooseCandidate = async (
    candidate: LocationCandidate | RecentCustomerLocation | SavedCustomerLocation
  ) => {
    const selected = await selectLocation({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      label: candidate.label,
      source: 'manual',
    });
    if (selected) {
      setQuery('');
      setView('summary');
    }
  };

  const chooseRegion = async (regionId: ServiceRegionId) => {
    if (await selectRegion(regionId)) {
      setQuery('');
      setView('location');
    }
  };

  const renderLocationRow = (
    item: LocationCandidate | RecentCustomerLocation | SavedCustomerLocation,
    icon: React.ComponentProps<typeof Ionicons>['name'],
    options?: { title?: string; onRemove?: () => void }
  ) => (
    <TouchableOpacity
      key={`${item.latitude}-${item.longitude}-${options?.title ?? item.label}`}
      style={styles.locationResult}
      onPress={() => chooseCandidate(item)}
      disabled={saving}
      accessibilityRole="button"
      accessibilityLabel={`Use ${options?.title ?? compactLocationLabel(item.label)}`}
    >
      <View style={styles.resultIcon}>
        <Ionicons name={icon} size={19} color="#24743C" />
      </View>
      <View style={styles.resultCopy}>
        {options?.title ? <Text style={styles.resultTitle}>{options.title}</Text> : null}
        <Text style={options?.title ? styles.resultSubtitle : styles.resultTitle} numberOfLines={2}>
          {compactLocationLabel(item.label)}
        </Text>
      </View>
      {options?.onRemove ? (
        <TouchableOpacity
          style={styles.removeSavedButton}
          onPress={event => {
            event.stopPropagation();
            options.onRemove?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove saved location ${options.title}`}
        >
          <Ionicons name="trash-outline" size={18} color="#8E4A46" />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#A1AAA4" />
      )}
    </TouchableOpacity>
  );

  const renderSummary = () => (
    <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.dragHandle} />
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>Choose delivery or pickup</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close location and time picker"
        >
          <Ionicons name="close" size={22} color="#27322B" />
        </TouchableOpacity>
      </View>

      <View style={styles.segmentedControl}>
        {(['delivery', 'pickup'] as const).map(option => {
          const selected = fulfillmentPreference === option;
          const unavailable = option === 'delivery' && !region.deliveryAvailable;
          return (
            <TouchableOpacity
              key={option}
              style={[
                styles.segment,
                selected && styles.segmentSelected,
                unavailable && styles.segmentDisabled,
              ]}
              onPress={() => setFulfillmentPreference(option)}
              disabled={unavailable}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: unavailable }}
            >
              <Ionicons
                name={option === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline'}
                size={18}
                color={selected ? '#FFFFFF' : '#376143'}
              />
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                {option === 'delivery' ? 'Delivery' : 'Pickup'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.preferenceRows}>
        <TouchableOpacity style={styles.preferenceRow} onPress={() => setView('location')}>
          <View style={styles.preferenceIcon}>
            <Ionicons name="location-outline" size={21} color="#23713B" />
          </View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>
              {fulfillmentPreference === 'delivery' ? 'Delivery area' : 'Pickup area'}
            </Text>
            <Text style={styles.preferenceValue} numberOfLines={1}>
              {location ? compactLocationLabel(location.label) : `Choose an area in ${region.name}`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8E9891" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.preferenceRow} onPress={() => setView('time')}>
          <View style={styles.preferenceIcon}>
            <Ionicons name="time-outline" size={21} color="#23713B" />
          </View>
          <View style={styles.preferenceCopy}>
            <Text style={styles.preferenceLabel}>
              {fulfillmentPreference === 'delivery' ? 'Delivery time' : 'Pickup time'}
            </Text>
            <Text style={styles.preferenceValue}>
              {formatCustomerOrderTime(orderTimePreference)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#8E9891" />
        </TouchableOpacity>
      </View>

      {!region.deliveryAvailable ? (
        <View style={styles.warningCard}>
          <Ionicons name="information-circle-outline" size={19} color="#8A6100" />
          <Text style={styles.warningText}>
            Delivery is not available in Sandakan yet. You can still browse and order for pickup.
          </Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color="#B3261E" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.confirmButton, !location && styles.confirmButtonDisabled]}
        disabled={!location}
        onPress={onClose}
      >
        <Text style={styles.confirmButtonText}>Confirm</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const renderLocationPicker = () => {
    const showSearchResults = query.trim().length >= 3;
    const regionRecentLocations = recentLocations.filter(item => item.regionId === region.id);
    const regionSavedLocations = savedLocations.filter(item => item.regionId === region.id);
    return (
      <SafeAreaView style={styles.fullPage} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.pageHeader}>
          <TouchableOpacity
            style={styles.pageBackButton}
            onPress={() => setView('summary')}
            accessibilityRole="button"
            accessibilityLabel="Back to delivery preferences"
          >
            <Ionicons name="arrow-back" size={24} color="#26302A" />
          </TouchableOpacity>
          <View style={styles.searchBox}>
            <Ionicons name="location" size={18} color="#EA4335" />
            <TextInput
              value={query}
              onChangeText={value => {
                setQuery(value);
                setSearchError(null);
              }}
              style={styles.searchInput}
              placeholder={`Search in ${region.name}`}
              placeholderTextColor="#929B95"
              autoFocus
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={19} color="#929B95" />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.regionButton}
            onPress={() => setView('region')}
            accessibilityRole="button"
            accessibilityLabel="Choose service region"
          >
            <Ionicons name="globe-outline" size={23} color="#243129" />
          </TouchableOpacity>
        </View>
        <Text style={styles.regionCaption}>{region.subtitle}</Text>

        {!showSearchResults ? (
          <View style={styles.tabs} accessibilityRole="tablist">
            {(['recent', 'suggested', 'saved'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === tab }}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab[0].toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <ScrollView
          style={styles.resultsScroll}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
        >
          {showSearchResults ? (
            searching ? (
              <View style={styles.loadingState}>
                <ActivityIndicator color="#2E9B4D" />
                <Text style={styles.loadingText}>Searching {region.name}…</Text>
              </View>
            ) : searchResults.length > 0 ? (
              searchResults.map(item => renderLocationRow(item, 'location-outline'))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={30} color="#9BA49E" />
                <Text style={styles.emptyTitle}>{searchError ?? 'No matching areas found'}</Text>
                <Text style={styles.emptyText}>
                  Try another area or choose Klang Valley or Sandakan from the globe button.
                </Text>
              </View>
            )
          ) : (
            <>
              <TouchableOpacity
                style={styles.currentLocationRow}
                onPress={chooseCurrentLocation}
                disabled={saving}
              >
                <View style={styles.currentIcon}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#23713B" />
                  ) : (
                    <Ionicons name="navigate" size={19} color="#23713B" />
                  )}
                </View>
                <View style={styles.resultCopy}>
                  <Text style={styles.resultTitle}>Use my current area</Text>
                  <Text style={styles.resultSubtitle}>Approximate location only</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#A1AAA4" />
              </TouchableOpacity>

              {activeTab === 'recent' ? (
                regionRecentLocations.length > 0 ? (
                  regionRecentLocations.map(item => renderLocationRow(item, 'time-outline'))
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="time-outline" size={30} color="#9BA49E" />
                    <Text style={styles.emptyTitle}>No recent areas</Text>
                    <Text style={styles.emptyText}>Places you choose will appear here.</Text>
                  </View>
                )
              ) : null}

              {activeTab === 'suggested'
                ? region.suggestions.map(item => renderLocationRow(item, 'location-outline'))
                : null}

              {activeTab === 'saved' ? (
                <>
                  {location ? (
                    <View style={styles.saveActions}>
                      <Text style={styles.saveActionsTitle}>Save your current area</Text>
                      <View style={styles.saveActionRow}>
                        {['Home', 'Work'].map(name => (
                          <TouchableOpacity
                            key={name}
                            style={styles.saveAction}
                            onPress={() => saveNamedLocation(name)}
                          >
                            <Ionicons
                              name={name === 'Home' ? 'home-outline' : 'briefcase-outline'}
                              size={17}
                              color="#23713B"
                            />
                            <Text style={styles.saveActionText}>Save as {name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {regionSavedLocations.length > 0 ? (
                    regionSavedLocations.map(item =>
                      renderLocationRow(item, 'bookmark-outline', {
                        title: item.name,
                        onRemove: () => removeSavedLocation(item.id),
                      })
                    )
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="bookmark-outline" size={30} color="#9BA49E" />
                      <Text style={styles.emptyTitle}>No saved areas</Text>
                      <Text style={styles.emptyText}>
                        Save an area as Home or Work for quick access.
                      </Text>
                    </View>
                  )}
                </>
              ) : null}
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#B3261E" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    );
  };

  const renderRegionPicker = () => (
    <SafeAreaView style={styles.fullPage} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.simpleHeader}>
        <TouchableOpacity style={styles.pageBackButton} onPress={() => setView('location')}>
          <Ionicons name="arrow-back" size={24} color="#26302A" />
        </TouchableOpacity>
        <View style={styles.simpleHeaderCopy}>
          <Text style={styles.simpleHeaderTitle}>Choose region</Text>
          <Text style={styles.simpleHeaderSubtitle}>Malaysia</Text>
        </View>
        <Ionicons name="globe-outline" size={23} color="#26302A" />
      </View>
      <ScrollView contentContainerStyle={styles.regionList}>
        {SERVICE_REGIONS.map(item => {
          const selected = item.id === region.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.regionRow, selected && styles.regionRowSelected]}
              onPress={() => chooseRegion(item.id)}
              disabled={saving}
            >
              <View style={styles.regionMapIcon}>
                <Ionicons name="map-outline" size={23} color="#24743C" />
              </View>
              <View style={styles.resultCopy}>
                <Text style={styles.regionName}>{item.name}</Text>
                <Text style={styles.resultSubtitle}>{item.subtitle}</Text>
                {!item.deliveryAvailable ? (
                  <Text style={styles.pickupOnlyText}>Pickup only for now</Text>
                ) : null}
              </View>
              {selected ? (
                <Ionicons name="checkmark-circle" size={23} color="#2E9B4D" />
              ) : (
                <Ionicons name="chevron-forward" size={19} color="#A1AAA4" />
              )}
            </TouchableOpacity>
          );
        })}
        <View style={styles.comingSoonCard}>
          <Ionicons name="megaphone-outline" size={20} color="#7A641E" />
          <Text style={styles.comingSoonText}>
            More Malaysian regions are coming soon!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  const renderTimePicker = () => (
    <SafeAreaView style={styles.timeSheet} edges={['bottom']} accessibilityViewIsModal>
      <View style={styles.dragHandle} />
      <View style={styles.simpleHeader}>
        <TouchableOpacity style={styles.pageBackButton} onPress={() => setView('summary')}>
          <Ionicons name="arrow-back" size={24} color="#26302A" />
        </TouchableOpacity>
        <View style={styles.simpleHeaderCopy}>
          <Text style={styles.simpleHeaderTitle}>
            {fulfillmentPreference === 'delivery' ? 'Delivery time' : 'Pickup time'}
          </Text>
          <Text style={styles.simpleHeaderSubtitle}>Choose when you want your order</Text>
        </View>
      </View>
      <ScrollView
        style={styles.timeScroll}
        contentContainerStyle={styles.timeContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.asapRow, orderTimePreference.mode === 'asap' && styles.asapRowSelected]}
          onPress={() => {
            setOrderTimePreference({ mode: 'asap' });
            setView('summary');
          }}
        >
          <View style={styles.currentIcon}>
            <Ionicons name="flash" size={19} color="#23713B" />
          </View>
          <View style={styles.resultCopy}>
            <Text style={styles.resultTitle}>As soon as possible</Text>
            <Text style={styles.resultSubtitle}>Use each restaurant’s earliest available time</Text>
          </View>
          {orderTimePreference.mode === 'asap' ? (
            <Ionicons name="checkmark-circle" size={23} color="#2E9B4D" />
          ) : null}
        </TouchableOpacity>

        <Text style={styles.scheduleHeading}>Schedule for later</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayRow}
        >
          {scheduleDays.map(day => {
            const selected = activeScheduleDate === day.serviceDate;
            return (
              <TouchableOpacity
                key={day.serviceDate}
                style={[styles.dayChip, selected && styles.dayChipSelected]}
                onPress={() => setActiveScheduleDate(day.serviceDate)}
              >
                <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.timeGrid}>
          {timeSlots.map(slot => {
            const selected =
              orderTimePreference.mode === 'scheduled' &&
              orderTimePreference.scheduledAt === slot.value;
            return (
              <TouchableOpacity
                key={slot.value}
                style={[styles.timeChip, selected && styles.timeChipSelected]}
                onPress={() => {
                  setOrderTimePreference({ mode: 'scheduled', scheduledAt: slot.value });
                  setView('summary');
                }}
              >
                <Text style={[styles.timeChipText, selected && styles.timeChipTextSelected]}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {timeSlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No more times today</Text>
            <Text style={styles.emptyText}>Choose tomorrow or the next available day.</Text>
          </View>
        ) : null}
        <Text style={styles.timeDisclaimer}>
          Individual restaurants may offer different times. We’ll show exact availability on their
          menu.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );

  const fullScreen = view === 'location' || view === 'region';
  return (
    <Modal
      visible={visible}
      transparent
      animationType={fullScreen ? 'fade' : 'slide'}
      onRequestClose={view === 'summary' ? close : () => setView('summary')}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={[styles.modalRoot, fullScreen && styles.modalRootFull]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {!fullScreen ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close location and time picker"
          />
        ) : null}
        {view === 'summary'
          ? renderSummary()
          : view === 'location'
            ? renderLocationPicker()
            : view === 'region'
              ? renderRegionPicker()
              : renderTimePicker()}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 25, 20, 0.5)',
  },
  modalRootFull: { backgroundColor: '#FFFFFF' },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 42,
    height: 5,
    marginTop: 9,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#DDE3DF',
  },
  sheetHeader: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { color: '#19231D', fontSize: 21, fontWeight: '800' },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F1F4F2',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#EEF3EF',
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
  },
  segmentSelected: { backgroundColor: '#25A84B' },
  segmentDisabled: { opacity: 0.45 },
  segmentText: { color: '#376143', fontSize: 14, fontWeight: '700' },
  segmentTextSelected: { color: '#FFFFFF' },
  preferenceRows: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DEE5E0',
    borderRadius: 16,
  },
  preferenceRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E9E5',
  },
  preferenceIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#EAF6ED',
    marginRight: 11,
  },
  preferenceCopy: { flex: 1, minWidth: 0 },
  preferenceLabel: { color: '#68736B', fontSize: 11, fontWeight: '700' },
  preferenceValue: { color: '#1D2921', fontSize: 14, fontWeight: '700', marginTop: 3 },
  approximateNote: {
    color: '#78827B',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 9,
    paddingHorizontal: 2,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7DF',
    padding: 11,
  },
  warningText: { flex: 1, color: '#745C17', fontSize: 12, lineHeight: 17 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    borderRadius: 11,
    backgroundColor: '#FDEDEA',
    padding: 10,
  },
  errorText: { flex: 1, color: '#9C261E', fontSize: 12, lineHeight: 17 },
  confirmButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: '#25A84B',
  },
  confirmButtonDisabled: { backgroundColor: '#B7C2BA' },
  confirmButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  fullPage: { flex: 1, backgroundColor: '#FFFFFF' },
  timeSheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  timeScroll: { flexGrow: 0 },
  pageHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  pageBackButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#63B778',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  searchInput: { flex: 1, color: '#202A23', fontSize: 14, paddingVertical: 10 },
  regionButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  regionCaption: { color: '#778078', fontSize: 10, paddingHorizontal: 61, paddingBottom: 8 },
  tabs: {
    minHeight: 45,
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3E8E4',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#269B49' },
  tabText: { color: '#7A837D', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#237A3B' },
  resultsScroll: { flex: 1 },
  resultsContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 30 },
  currentLocationRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#F3F9F4',
    paddingHorizontal: 13,
    marginVertical: 12,
  },
  currentIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#E4F3E7',
    marginRight: 11,
  },
  locationResult: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E8E5',
    paddingHorizontal: 3,
  },
  resultIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#EFF6F1',
    marginRight: 11,
  },
  resultCopy: { flex: 1, minWidth: 0 },
  resultTitle: { color: '#202A23', fontSize: 14, fontWeight: '700' },
  resultSubtitle: { color: '#77817A', fontSize: 11, lineHeight: 16, marginTop: 2 },
  removeSavedButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  loadingState: { alignItems: 'center', justifyContent: 'center', paddingTop: 54, gap: 10 },
  loadingText: { color: '#68736B', fontSize: 13 },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyTitle: { color: '#3C4740', fontSize: 14, fontWeight: '700', marginTop: 9 },
  emptyText: { color: '#7A837D', fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  saveActions: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E7EBE8' },
  saveActionsTitle: { color: '#667168', fontSize: 11, fontWeight: '700', marginBottom: 9 },
  saveActionRow: { flexDirection: 'row', gap: 8 },
  saveAction: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#CFE3D3',
    borderRadius: 11,
    backgroundColor: '#F5FAF6',
  },
  saveActionText: { color: '#276F3B', fontSize: 12, fontWeight: '700' },
  simpleHeader: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E5E1',
  },
  simpleHeaderCopy: { flex: 1 },
  simpleHeaderTitle: { color: '#202A23', fontSize: 18, fontWeight: '800' },
  simpleHeaderSubtitle: { color: '#7A837D', fontSize: 10, marginTop: 2 },
  regionList: { padding: 16 },
  regionRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderWidth: 1,
    borderColor: '#E0E5E1',
    borderRadius: 15,
    marginBottom: 10,
  },
  regionRowSelected: { borderColor: '#7BC58C', backgroundColor: '#F2FAF4' },
  regionMapIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#E8F5EB',
    marginRight: 12,
  },
  regionName: { color: '#202A23', fontSize: 15, fontWeight: '800' },
  pickupOnlyText: { color: '#8A6100', fontSize: 10, fontWeight: '700', marginTop: 3 },
  comingSoonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 8,
    borderRadius: 13,
    backgroundColor: '#FFF8E5',
    padding: 13,
  },
  comingSoonText: { flex: 1, color: '#705F2A', fontSize: 12, lineHeight: 17 },
  timeContent: { padding: 16, paddingBottom: 36 },
  asapRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderWidth: 1,
    borderColor: '#E0E5E1',
    borderRadius: 15,
  },
  asapRowSelected: { borderColor: '#75C187', backgroundColor: '#F1FAF3' },
  scheduleHeading: { color: '#202A23', fontSize: 16, fontWeight: '800', marginTop: 24 },
  dayRow: { gap: 8, paddingVertical: 13 },
  dayChip: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: '#DDE4DF',
    borderRadius: 21,
  },
  dayChipSelected: { borderColor: '#25A84B', backgroundColor: '#25A84B' },
  dayChipText: { color: '#56625A', fontSize: 12, fontWeight: '700' },
  dayChipTextSelected: { color: '#FFFFFF' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    width: '31%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDE4DF',
    borderRadius: 11,
  },
  timeChipSelected: { borderColor: '#25A84B', backgroundColor: '#EAF7ED' },
  timeChipText: { color: '#4B5750', fontSize: 12, fontWeight: '700' },
  timeChipTextSelected: { color: '#237A3B' },
  timeDisclaimer: {
    color: '#7A837D',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 22,
  },
});
