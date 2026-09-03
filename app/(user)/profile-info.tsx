import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';

const AVATAR_BUCKET = 'avatars';

type EditingField = 'name' | 'email' | 'phone' | null;

const EditProfileScreen = () => {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone_number, profile_image')
          .eq('user_id', user.id)
          .single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row found
        setName(data?.full_name ?? '');
        setPhone(data?.phone_number ?? '');
        setAvatarUrl(data?.profile_image ?? null);
        setEmail(user.email ?? '');
      } catch (e: any) {
        Alert.alert('Could not load profile', e.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const pickAndUploadAvatar = async () => {
    if (!user) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access in Settings to change your avatar.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
    const contentType = asset.mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    setUploadingAvatar(true);
    try {
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = publicData.publicUrl;

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ profile_image: publicUrl })
        .eq('user_id', user.id);
      if (dbError) throw dbError;

      setAvatarUrl(publicUrl);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const startEdit = (field: Exclude<EditingField, null>, current: string) => {
    setEditing(field);
    setDraft(current);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };

  const saveEdit = async () => {
    if (!user || !editing) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      Alert.alert('Required', 'This field cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'name') {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: trimmed })
          .eq('user_id', user.id);
        if (error) throw error;
        setName(trimmed);
      } else if (editing === 'phone') {
        const { error } = await supabase
          .from('profiles')
          .update({ phone_number: trimmed })
          .eq('user_id', user.id);
        if (error) throw error;
        setPhone(trimmed);
      } else if (editing === 'email') {
        const { error } = await supabase.auth.updateUser({ email: trimmed });
        if (error) throw error;
        Alert.alert(
          'Check your email',
          `We sent a confirmation link to ${trimmed}. Your email will update once you click the link.`
        );
        // Don't optimistically update local email — wait for confirmation
      }
      setEditing(null);
      setDraft('');
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    label: string,
    value: string,
    fieldKey: Exclude<EditingField, null>,
    opts?: {
      keyboardType?: 'email-address' | 'phone-pad' | 'default';
      autoCapitalize?: 'none' | 'words';
      placeholder?: string;
      helper?: string;
    }
  ) => {
    const isEditing = editing === fieldKey;
    return (
      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>{label}</Text>
        {isEditing ? (
          <>
            <View style={styles.editingRow}>
              <TextInput
                style={styles.editInput}
                value={draft}
                onChangeText={setDraft}
                autoFocus
                keyboardType={opts?.keyboardType ?? 'default'}
                autoCapitalize={opts?.autoCapitalize ?? 'sentences'}
                placeholder={opts?.placeholder}
                placeholderTextColor="#aaa"
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={saveEdit}
              />
              <View style={styles.editButtons}>
                <TouchableOpacity onPress={cancelEdit} disabled={saving} style={styles.iconBtn}>
                  <Ionicons name="close" size={22} color="#999" />
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEdit} disabled={saving} style={styles.iconBtn}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#4CAF50" />
                  ) : (
                    <Ionicons name="checkmark" size={24} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {opts?.helper && <Text style={styles.helperText}>{opts.helper}</Text>}
          </>
        ) : (
          <View style={styles.inputRow}>
            <Text style={styles.inputValue}>{value || '—'}</Text>
            <TouchableOpacity onPress={() => startEdit(fieldKey, value)}>
              <Ionicons name="pencil" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.divider} />
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.signedOutText}>Sign in to view your profile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile Information</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <TouchableOpacity
              onPress={pickAndUploadAvatar}
              disabled={uploadingAvatar}
              activeOpacity={0.8}
            >
              <View style={styles.avatarPlaceholder}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={60} color="#999" />
                )}
                {uploadingAvatar && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editAvatarButton}
              onPress={pickAndUploadAvatar}
              disabled={uploadingAvatar}
            >
              <Ionicons name="camera" size={16} color="#333" />
              <Text style={styles.editAvatarText}>{uploadingAvatar ? 'Uploading…' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            {renderField('FULL NAME', name, 'name', {
              autoCapitalize: 'words',
              placeholder: 'Your full name',
            })}
            {renderField('EMAIL ADDRESS', email, 'email', {
              keyboardType: 'email-address',
              autoCapitalize: 'none',
              placeholder: 'you@example.com',
              helper: 'A confirmation link will be sent before your email changes.',
            })}
            {renderField('PHONE NUMBER', phone, 'phone', {
              keyboardType: 'phone-pad',
              placeholder: '+1 555 000 0000',
            })}
          </View>

          {/* Delete Account */}
          <TouchableOpacity style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>Delete my account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signedOutText: {
    fontSize: 16,
    color: '#666',
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
  editingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editInput: {
    flex: 1,
    fontSize: 18,
    color: '#000',
    paddingVertical: 4,
  },
  editButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
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
