import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

export interface AdminSelectOption<T extends string> {
  key: T;
  label: string;
}

interface AdminSelectProps<T extends string> {
  label: string;
  value: T;
  options: Array<AdminSelectOption<T>>;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

interface AnchorPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function AdminSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  accessibilityLabel = label,
}: AdminSelectProps<T>) {
  const anchorRef = useRef<View>(null);
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorPosition | null>(null);
  const selectedLabel = options.find(option => option.key === value)?.label ?? value;

  const openMenu = () => {
    setOpen(true);
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  };

  const menuWidth = Math.min(Math.max(anchor?.width ?? 220, 220), viewportWidth - 24);
  const menuHeight = Math.min(options.length * 43 + 12, 356);
  const menuLeft = Math.max(12, Math.min(anchor?.x ?? 12, viewportWidth - menuWidth - 12));
  const preferredTop = (anchor?.y ?? 12) + (anchor?.height ?? 0) + 6;
  const menuTop = Math.max(12, Math.min(preferredTop, viewportHeight - menuHeight - 12));

  return (
    <View ref={anchorRef} collapsable={false}>
      <TouchableOpacity
        testID={`admin-select-${label.toLowerCase().replace(/\s+/g, '-')}`}
        style={styles.button}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.buttonText} numberOfLines={1}>
          {label}: {selectedLabel}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color="#667085" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.backdrop}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close selector"
          />
          <View
            style={[styles.menu, { left: menuLeft, top: menuTop, width: menuWidth }]}
            accessibilityRole="menu"
          >
            <ScrollView style={{ maxHeight: menuHeight }} showsVerticalScrollIndicator={false}>
              {options.map(option => {
                const selected = option.key === value;
                return (
                  <TouchableOpacity
                    key={option.key}
                    testID={`admin-select-option-${option.key}`}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => {
                      onChange(option.key);
                      setOpen(false);
                    }}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark" size={17} color="#278C43" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    minWidth: 174,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 11,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
  },
  buttonText: { flexShrink: 1, fontFamily: 'mon-sb', fontSize: 10, color: '#56635B' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20, 29, 23, 0.08)' },
  menu: {
    position: 'absolute',
    padding: 6,
    borderWidth: 1,
    borderColor: '#DDE3DF',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#17211B',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 12,
  },
  option: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  optionSelected: { backgroundColor: '#EAF8EE' },
  optionText: { flex: 1, fontFamily: 'mon', fontSize: 11, color: '#536058' },
  optionTextSelected: { fontFamily: 'mon-sb', color: '#237A3B' },
});
