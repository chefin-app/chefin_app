/* Search bar component, styling and size etc. are here*/

import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '@/src/styles/theme';

type Props = {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputRef?: React.RefObject<TextInput | null>;
};

const SearchBar = ({
  value,
  onChangeText,
  placeholder = 'Home restaurants, dishes, locations...',
  onSubmitEditing,
  containerStyle,
  inputRef,
}: Props) => {
  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Ionicons name="search" size={20} color={theme.colors.textMuted} style={styles.icon} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.colors.textMuted}
        onSubmitEditing={() => {
          if (onSubmitEditing) onSubmitEditing();
        }}
        returnKeyType="search"
        multiline={false}
        scrollEnabled={false}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          style={styles.clearButton}
          accessibilityLabel="Clear search"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default SearchBar;

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: '#ffffffff',
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#0d9b4df6',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
    width: '95%',
    alignSelf: 'center',
  },
  icon: {
    marginRight: 8,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textStrong,
    height: 25,
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 8,
    alignSelf: 'center',
  },
});
