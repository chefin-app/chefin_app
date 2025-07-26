// this is the bottom tab bar component
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ImageSourcePropType } from 'react-native';

// You might have a separate Colors file or define them here for now
const PRIMARY_COLOR = '#4ADE80';
const INACTIVE_COLOR = '#9E9E9E';

// Props definition for the component, received from Expo Router's Tabs
interface BottomTabBarProps {
  state: any; // Contains info about the current navigation state (active route index)
  descriptors: any; // Contains options for each screen (like the 'title' option we set)
  navigation: any; // The navigation object to perform navigate actions
}

// Image imports — only active images now
const icons: Record<string, { active: ImageSourcePropType }> = {
  // We are mapping to tab folder, home.tsx file
  index: {
    active: require('../assets/images/home_icon.png'),
  },
  search: {
    active: require('../assets/images/search.png'),
  },
  account: {
    active: require('../assets/images/user.png'),
  },
};

// its taking 3 props
const BottomTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  return (
    // we are creating the horizontal tab bar at the bottom
    <View style={styles.container}>
      {/* we loop through each tab */}
      {state.routes.map((route: any, index: number) => {
        // we are getting the label for each tab
        const { options } = descriptors[route.key];
        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
              ? options.title
              : route.name;

        // we check if this tab is selected
        const isFocused = state.index === index;

        // if its active = set it as primary colour otherwise
        const textColor = isFocused ? PRIMARY_COLOR : INACTIVE_COLOR;

        // when we press on the tab
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key, // identifying the choesen tab
            canPreventDefault: true, // we can allow others to block this event
          });

          if (!isFocused && !event.defaultPrevented) {
            // we navigate to that tab
            navigation.navigate({ name: route.name, merge: true });
          }
        };

        // we have a long press function if user holds the button for a while
        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        // Use the single active image for all states, tint it for active/inactive
        return (
          <TouchableOpacity
            // we are making each tab pressable
            key={route.key} // we track each tab
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}} // shows which tab is active
            accessibilityLabel={options.tabBarAccessibilityLabel}
            testID={options.tabBarTestID}
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tabItem}
          >
            <Image
              source={icons[route.name]?.active}
              style={{ width: 24, height: 24, tintColor: textColor }}
            />

            {/* we are applying styling */}
            <Text style={{ ...styles.tabLabel, color: textColor }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 53, // Consistent height from Figma
    backgroundColor: '#fff', // White background
    borderTopWidth: 1, // Subtle border at the top
    borderTopColor: 'white',
    alignItems: 'center',
    justifyContent: 'space-around', // Distribute items evenly
    paddingBottom: 5, // Small padding for bottom safe area
  },
  tabItem: {
    flex: 1, // Each item takes equal space
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5, // Vertical padding inside each tab
  },
  tabLabel: {
    fontSize: 10, // Small text size as per Figma
    marginTop: 2, // Space between icon and text
  },
});

export default BottomTabBar;
