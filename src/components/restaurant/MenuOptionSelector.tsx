import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { MenuOptionGroup } from '@/src/types/menuOptions';
import {
  getOptionRuleLabel,
  toggleOptionSelection,
  type MenuOptionSelectionState,
} from '@/src/utils/menuOptions';

interface Props {
  groups: MenuOptionGroup[];
  selected: MenuOptionSelectionState;
  onChange: (next: MenuOptionSelectionState) => void;
}

export default function MenuOptionSelector({ groups, selected, onChange }: Props) {
  if (groups.length === 0) return null;
  return (
    <View>
      {groups.map(group => (
        <View key={group.id} style={styles.group}>
          <View style={styles.header}>
            <Text style={styles.title}>{group.name}</Text>
            <View style={[styles.rule, group.required && styles.requiredRule]}>
              <Text style={[styles.ruleText, group.required && styles.requiredRuleText]}>
                {getOptionRuleLabel(group)}
              </Text>
            </View>
          </View>
          {group.options.map(option => {
            const checked = (selected[group.id] ?? []).includes(option.id);
            const disabled = !option.isAvailable;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.option, disabled && styles.optionDisabled]}
                disabled={disabled}
                onPress={() => onChange(toggleOptionSelection(group, option.id, selected))}
                accessibilityRole={group.selectionType === 'single' ? 'radio' : 'checkbox'}
                accessibilityState={{ checked, disabled }}
              >
                <Ionicons
                  name={
                    group.selectionType === 'single'
                      ? checked
                        ? 'radio-button-on'
                        : 'radio-button-off'
                      : checked
                        ? 'checkbox'
                        : 'square-outline'
                  }
                  size={26}
                  color={disabled ? '#C4CAC6' : checked ? '#20A84F' : '#AAB2AD'}
                />
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionName, disabled && styles.disabledText]}>
                    {option.name}
                  </Text>
                  {disabled ? <Text style={styles.soldOut}>Sold out</Text> : null}
                </View>
                {option.priceDelta > 0 ? (
                  <Text style={[styles.price, disabled && styles.disabledText]}>
                    +RM {option.priceDelta.toFixed(2)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderBottomWidth: 8,
    borderColor: '#F4F6F4',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontFamily: 'mon-b', fontSize: 21, color: '#222A25' },
  rule: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF1EF',
  },
  requiredRule: { backgroundColor: '#DCF7E3' },
  ruleText: { fontFamily: 'mon-sb', fontSize: 11, color: '#657069' },
  requiredRuleText: { color: '#18763A' },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  optionDisabled: { opacity: 0.58 },
  optionCopy: { flex: 1 },
  optionName: { fontFamily: 'mon', fontSize: 16, lineHeight: 22, color: '#333B36' },
  soldOut: { marginTop: 2, fontFamily: 'mon-sb', fontSize: 11, color: '#8A918D' },
  price: { fontFamily: 'mon-sb', fontSize: 14, color: '#3F4943' },
  disabledText: { color: '#A5ACA7' },
});
