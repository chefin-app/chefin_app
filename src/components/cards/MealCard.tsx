// import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';
// import React, { useState } from 'react';
// import { Ionicons } from '@expo/vector-icons';

// const MealCard = () => {
//   const [isFavorite, setIsFavorite] = useState(false);
//   return (
//     <TouchableOpacity style={styles.card}>
//       <ImageBackground
//         source={require('../../assets/images/templateMeal.jpg')}
//         style={styles.image}
//         imageStyle={styles.imageStyle}
//       >
//         <TouchableOpacity style={styles.heartIcon} onPress={() => setIsFavorite(prev => !prev)}>
//           <Ionicons
//             name={isFavorite ? 'heart' : 'heart-outline'}
//             size={24}
//             color={isFavorite ? '#ff0000' : '#111111'}
//           />
//         </TouchableOpacity>
//       </ImageBackground>

//       <View style={styles.infoContainer}>
//         <Image source={require('../../assets/images/templateAvatar.jpg')} style={styles.avatar} />

//         <View style={{ flex: 1 }}>
//           <View style={styles.titleRow}>
//             <Text style={styles.title} numberOfLines={1}>
//               Sigma Eats
//             </Text>
//             <View style={styles.rating}>
//               <Ionicons name="star" size={16} color="#FFD700" />
//               <Text style={styles.ratingText}>4.5 (223)</Text>
//             </View>
//           </View>

//           <Text style={styles.subtitle}>Italian, Pizza, Pasta</Text>
//         </View>
//       </View>

//       <View style={{ flex: 1 }}>
//         <Text style={styles.available}>
//           Available <Text style={{ fontWeight: 'bold' }}>18/07</Text>
//         </Text>
//       </View>
//     </TouchableOpacity>
//   );
// };

// const styles = StyleSheet.create({
//   card: {
//     width: 300,
//     height: 220,
//     backgroundColor: '#ffffff',
//     borderRadius: 10,
//     elevation: 4,
//     shadowColor: '#000000',
//     shadowOpacity: 0.1,
//     shadowOffset: { width: 0, height: 2 },
//   },
//   image: {
//     width: '100%',
//     height: 120,
//     borderRadius: 10,
//     justifyContent: 'flex-start',
//     alignItems: 'flex-end',
//     overflow: 'hidden',
//     position: 'relative',
//   },
//   imageStyle: {
//     resizeMode: 'cover',
//     borderTopLeftRadius: 12,
//     borderTopRightRadius: 12,
//   },
//   heartIcon: {
//     backgroundColor: '#fff',
//     borderRadius: 20,
//     padding: 6,
//     position: 'absolute',
//     top: 6,
//     right: 6,
//   },
//   infoContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     padding: 12,
//     gap: 8,
//   },
//   avatar: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     borderWidth: 2,
//   },
//   titleRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     gap: 8,
//   },
//   title: {
//     color: '#333333',
//     fontSize: 16,
//     fontWeight: 'bold',
//     marginLeft: 8,
//     flexShrink: 1,
//     maxWidth: '70%',
//   },
//   subtitle: {
//     color: '#666666',
//     fontSize: 12,
//     marginTop: 2,
//     marginLeft: 8,
//   },
//   available: {
//     color: '#4CAF50',
//     fontSize: 12,
//     marginTop: 2,
//     marginLeft: 14,
//   },
//   rating: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginLeft: 'auto',
//     flexShrink: 0,
//   },
//   ratingText: {
//     marginLeft: 4,
//     fontSize: 12,
//     color: '#444',
//   },
// });
// export default MealCard;

import { View, Text, TouchableOpacity, StyleSheet, ImageBackground, Image } from 'react-native';
import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

// Define an interface for the component's props
interface MealCardProps {
  onPress?: () => void; // onPress is an optional function that takes no arguments and returns nothing
}

// Use the interface to type the component's props
const MealCard: React.FC<MealCardProps> = ({ onPress }) => {
  const [isFavorite, setIsFavorite] = useState(false);
  return (
    // Pass the onPress prop to the TouchableOpacity
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <ImageBackground
        source={require('../../assets/images/templateMeal.jpg')}
        style={styles.image}
        imageStyle={styles.imageStyle}
      >
        <TouchableOpacity style={styles.heartIcon} onPress={() => setIsFavorite(prev => !prev)}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={24}
            color={isFavorite ? '#ff0000' : '#111111'}
          />
        </TouchableOpacity>
      </ImageBackground>

      <View style={styles.infoContainer}>
        <Image source={require('../../assets/images/templateAvatar.jpg')} style={styles.avatar} />

        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              Sigma Eats
            </Text>
            <View style={styles.rating}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.ratingText}>4.5 (223)</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>Italian, Pizza, Pasta</Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.available}>
          Available <Text style={{ fontWeight: 'bold' }}>18/07</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 300,
    height: 220,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
  },
  image: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    overflow: 'hidden',
    position: 'relative',
  },
  imageStyle: {
    resizeMode: 'cover',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  heartIcon: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 6,
    position: 'absolute',
    top: 6,
    right: 6,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: '#333333',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
    flexShrink: 1,
    maxWidth: '70%',
  },
  subtitle: {
    color: '#666666',
    fontSize: 12,
    marginTop: 2,
    marginLeft: 8,
  },
  available: {
    color: '#4CAF50',
    fontSize: 12,
    marginTop: 2,
    marginLeft: 14,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#444',
  },
});
export default MealCard;
