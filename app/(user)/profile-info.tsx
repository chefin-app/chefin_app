import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TextInputField } from '@/src/components/inputs/TextInputField';

const EditProfileScreen = () => {
  const router = useRouter();
  const [name, setName] = useState('Nawaf Azim');
  const [email, setEmail] = useState('sforaji96@gmail.com');
  const [phone, setPhone] = useState('+880 1837226676');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile Information</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={60} color="#999" />
          </View>
          <TouchableOpacity style={styles.editAvatarButton}>
            <Ionicons name="camera" size={16} color="#333" />
            <Text style={styles.editAvatarText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>FULL NAME</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputValue}>{name}</Text>
              <TouchableOpacity>
                <Ionicons name="pencil" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputValue}>{email}</Text>
              <TouchableOpacity>
                <Ionicons name="pencil" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>PHONE NUMBER</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputValue}>{phone}</Text>
              <TouchableOpacity>
                <Ionicons name="pencil" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            <View style={styles.divider} />
          </View>
        </View>

        {/* Delete Account */}
        <TouchableOpacity style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Delete my account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  backButton: {
    padding: 5,
  },
  scrollContent: {
    padding: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  editAvatarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
  },
  editAvatarText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 30,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputValue: {
    fontSize: 18,
    color: '#000',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginTop: 15,
  },
  deleteButton: {
    marginTop: 50,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4d4d',
  },
});

export default EditProfileScreen;
