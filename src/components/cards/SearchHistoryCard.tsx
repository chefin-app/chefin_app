import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import React from 'react'
import { Ionicons } from '@expo/vector-icons';

interface HistoryCard {
    query: string;
    onPress?: () => void;
}

const SearchHistoryCard = ({ query, onPress }: HistoryCard) => {
    return (
        <TouchableOpacity style={styles.row} onPress={onPress}>
            <View style={styles.card}>
                <Ionicons name="time-outline" size={24} color="black"/>
            </View>
            <Text style={styles.text}>{query}</Text>
        </TouchableOpacity>
    )
}

export default SearchHistoryCard

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 0,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1efefff',
        paddingVertical: 12, // square size padding
        paddingHorizontal: 12,
        marginVertical: 0,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    icon: {
        marginRight: 12,
    },
    text: {
        fontSize: 16,
        color: '#000',
        marginLeft: 12,
    },
})