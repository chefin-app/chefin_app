import { StyleSheet, View, TextInput } from 'react-native';
type PhoneNumberInputProps = {
  value: string; // phone number text
  onChangeText: (text: string) => void; // callback when typing
  selectedCountry: { code: string } | null; // null if no country chosen
};
export const PhoneNumberInput: React.FC<PhoneNumberInputProps> = ({
  value,
  onChangeText,
  selectedCountry,
}) => {
  return (
    <TextInput
      style={styles.phoneInput}
      placeholder="Mobile number"
      placeholderTextColor="#999"
      value={value}
      onChangeText={onChangeText}
      keyboardType="phone-pad"
      maxLength={selectedCountry?.code === '+1' ? 14 : 15}
    />
  );
};

const styles = StyleSheet.create({
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 4,
  },
});
