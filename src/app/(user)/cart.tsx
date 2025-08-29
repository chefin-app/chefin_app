import React from 'react';
import { Button, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PrimaryButton from '@/src/components/buttons/PrimaryButton';
import { CaptionText } from '@/src/components/typography';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function CartScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>A world of flavour is waiting...</Text>
        <CaptionText>Add dishes to your cart now.</CaptionText>
        <PrimaryButton
          title="Start Shopping"
          onPress={() => console.log('Start Shopping pressed')}
          style={{ marginTop: 40, width: '80%' }}
        />
      </View>
      <TouchableOpacity style={styles.xButton} onPress={() => router.push('/home')}>
        <Ionicons name="close-outline" size={30} color="#34ec7bff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  xButton: {
    width: 30,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 20,
    position: 'absolute',
    top: 40,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10, // make sure it's above everything
  },
});
