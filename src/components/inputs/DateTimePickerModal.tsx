import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import DateTimePickerModalLib from 'react-native-modal-datetime-picker';

export type PickerMode = 'date' | 'time' | 'datetime';

interface Props {
  mode?: PickerMode;
  label?: string;
  initialDate?: Date;
  onConfirm: (date: Date) => void;
  buttonStyle?: object;
  buttonTextStyle?: object;
}

const DateTimePickerModal: React.FC<Props> = ({
  mode = 'date',
  label = 'Select Date',
  initialDate = new Date(),
  onConfirm,
  buttonStyle,
  buttonTextStyle,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const showPicker = () => setIsVisible(true);
  const hidePicker = () => setIsVisible(false);

  const handleConfirm = (date: Date) => {
    setSelectedDate(date);
    hidePicker();
    onConfirm(date);
  };

  const formattedLabel = selectedDate ? selectedDate.toLocaleString() : label;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={[styles.button, buttonStyle]} onPress={showPicker}>
        <Text style={[styles.buttonText, buttonTextStyle]}>{formattedLabel}</Text>
      </TouchableOpacity>
      <DateTimePickerModalLib
        isVisible={isVisible}
        mode={mode}
        date={selectedDate || initialDate}
        onConfirm={handleConfirm}
        onCancel={hidePicker}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  button: {
    backgroundColor: '#0066CC',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});

export default DateTimePickerModal;
