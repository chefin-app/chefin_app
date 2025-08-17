// LocationPicker.tsx
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, Alert, StyleSheet, ViewStyle, Pressable, Text, Platform } from 'react-native';
import MapView, {
  Marker,
  MarkerDragEvent,
  MapPressEvent,
  Region,
  LatLng,
  PROVIDER_GOOGLE,
} from 'react-native-maps';
import Entypo from '@expo/vector-icons/Entypo';

type Props = {
  value?: LatLng | null;
  onChange: (coord: LatLng) => void;
  initialRegion?: Region;
  mode?: 'centerPin' | 'draggable';
  style?: ViewStyle;
  showsUserLocation?: boolean;
  showConfirmButton?: boolean;
  minDelta?: number;
  maxDelta?: number;
};

export default function MapPinPicker({
  value = null,
  onChange,
  initialRegion = {
    latitude: 13.7563,
    longitude: 100.5018,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  },
  mode = 'centerPin',
  style,
  showsUserLocation = true,
  showConfirmButton = true,
  minDelta,
  maxDelta,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(
    value
      ? { ...initialRegion, latitude: value.latitude, longitude: value.longitude }
      : initialRegion
  );
  const [pressed, setPressed] = useState(false); // state for visual highlight

  const clampRegion = useCallback(
    (r: Region): Region => {
      const clampedLatDelta = minDelta ? Math.max(r.latitudeDelta, minDelta) : r.latitudeDelta;
      const clampedLongDelta = minDelta ? Math.max(r.longitudeDelta, minDelta) : r.longitudeDelta;
      const maxLatDelta = maxDelta ?? r.latitudeDelta;
      const maxLongDelta = maxDelta ?? r.longitudeDelta;

      return {
        ...r,
        latitudeDelta: Math.min(clampedLatDelta, maxLatDelta),
        longitudeDelta: Math.min(clampedLongDelta, maxLongDelta),
      };
    },
    [minDelta, maxDelta]
  );

  const handleRegionChangeComplete = useCallback(
    (r: Region) => {
      setRegion(clampRegion(r));
    },
    [clampRegion]
  );

  const handleMapPress = useCallback(
    (e: MapPressEvent) => {
      if (mode === 'draggable') {
        onChange(e.nativeEvent.coordinate);
      }
    },
    [mode, onChange]
  );

  const currentCoord: LatLng = useMemo(
    () => value ?? { latitude: region.latitude, longitude: region.longitude },
    [value, region]
  );

  const handleConfirm = () => {
    const coord = { latitude: region.latitude, longitude: region.longitude };
    console.log('Selected location:', coord.latitude, coord.longitude);
    onChange(coord);

    // Feedback
    setPressed(true);
    Alert.alert('Location Selected');

    // remove highlight after a short delay
    setTimeout(() => setPressed(false), 800);
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton
      >
        {mode === 'draggable' && currentCoord && (
          <Marker
            coordinate={currentCoord}
            draggable
            onDrag={(e: MarkerDragEvent) => {
              const coord = e.nativeEvent.coordinate;
              onChange(coord);
            }}
          />
        )}
      </MapView>

      {mode === 'centerPin' && (
        <>
          <View pointerEvents="none" style={styles.centerPinWrapper}>
            <Entypo name="location-pin" size={32} color="red" />
          </View>

          {showConfirmButton && (
            <Pressable
              style={[styles.confirmBesideMyLocation, pressed && styles.confirmPressed]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmText}>Use This Location</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const RESERVED_FOR_NATIVE_MYLOCATION = Platform.OS === 'android' ? 56 : 60;
const GAP = 12;

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: 12 },

  centerPinWrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -16,
    marginTop: -32,
  },

  confirmBesideMyLocation: {
    position: 'absolute',
    right: RESERVED_FOR_NATIVE_MYLOCATION + GAP,
    left: 16,
    bottom: 16,
    backgroundColor: '#4caf50',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmPressed: {
    backgroundColor: '#4a964d', // darker shade when pressed
  },

  confirmText: { color: 'white', fontWeight: '600' },
});
