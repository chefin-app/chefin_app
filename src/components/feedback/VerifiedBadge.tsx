import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export const VERIFIED_COOK_TOOLTIP =
  'Chefin has approved at least one food-safety or food-business credential from this cook';

interface VerifiedBadgeProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

interface AnchorPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCREEN_EDGE_GAP = 16;
const TOOLTIP_GAP = 12;
const TOOLTIP_MAX_WIDTH = 320;
const ARROW_SIZE = 12;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

/**
 * A tappable verified icon with an anchored explanation. The modal layer keeps
 * the tooltip above card clipping boundaries and lets a tap anywhere outside,
 * or the Android back button, dismiss it.
 */
const VerifiedBadge = ({ size = 18, color = '#0084ff', style }: VerifiedBadgeProps) => {
  const triggerRef = useRef<View>(null);
  const { width: screenWidth } = useWindowDimensions();
  const [anchor, setAnchor] = useState<AnchorPosition | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(0);

  const dismiss = useCallback(() => {
    setAnchor(null);
    setTooltipHeight(0);
  }, []);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      // The badge often sits inside a card that navigates when pressed.
      event.stopPropagation();

      if (anchor) {
        dismiss();
        return;
      }

      triggerRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        AccessibilityInfo.announceForAccessibility(VERIFIED_COOK_TOOLTIP);
      });
    },
    [anchor, dismiss]
  );

  const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, screenWidth - SCREEN_EDGE_GAP * 2);
  const tooltipLeft = anchor
    ? clamp(
        anchor.x + anchor.width / 2 - tooltipWidth / 2,
        SCREEN_EDGE_GAP,
        screenWidth - tooltipWidth - SCREEN_EDGE_GAP
      )
    : SCREEN_EDGE_GAP;
  const tooltipTop = anchor
    ? Math.max(SCREEN_EDGE_GAP, anchor.y - tooltipHeight - TOOLTIP_GAP)
    : SCREEN_EDGE_GAP;
  const arrowLeft = anchor
    ? clamp(
        anchor.x + anchor.width / 2 - tooltipLeft - ARROW_SIZE / 2,
        ARROW_SIZE,
        tooltipWidth - ARROW_SIZE * 2
      )
    : ARROW_SIZE;

  return (
    <>
      <Pressable
        ref={triggerRef}
        collapsable={false}
        hitSlop={8}
        onPress={handlePress}
        style={[styles.trigger, style]}
        accessibilityRole="button"
        accessibilityLabel="Verified cook"
        accessibilityHint="Shows which food-safety credentials this cook holds"
        accessibilityState={{ expanded: anchor !== null }}
      >
        <MaterialIcons name="verified" size={size} color={color} />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={dismiss}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={anchor !== null}
      >
        <Pressable
          accessible={false}
          onPress={dismiss}
          style={styles.dismissLayer}
          testID="verified-tooltip-dismiss-layer"
        >
          <Pressable
            accessibilityLiveRegion="polite"
            accessibilityViewIsModal
            accessible
            accessibilityLabel={VERIFIED_COOK_TOOLTIP}
            onAccessibilityEscape={dismiss}
            onLayout={event => setTooltipHeight(event.nativeEvent.layout.height)}
            onPress={event => event.stopPropagation()}
            style={[
              styles.tooltip,
              tooltipHeight > 0 && styles.tooltipMeasured,
              {
                left: tooltipLeft,
                top: tooltipTop,
                width: tooltipWidth,
              },
            ]}
            testID="verified-tooltip"
          >
            <Text style={styles.tooltipText}>{VERIFIED_COOK_TOOLTIP}</Text>
            <View style={[styles.arrow, { left: arrowLeft }]} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLayer: {
    ...StyleSheet.absoluteFill,
  },
  tooltip: {
    position: 'absolute',
    opacity: 0,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipMeasured: {
    opacity: 1,
  },
  tooltipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  arrow: {
    position: 'absolute',
    bottom: -ARROW_SIZE / 2,
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    backgroundColor: '#1F2937',
    transform: [{ rotate: '45deg' }],
  },
});

export default VerifiedBadge;
