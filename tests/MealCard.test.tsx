import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import MealCard from '@/src/components/cards/MealCard';

describe('MealCard', () => {
    const meal = {
        id: '1',
        cook_id: '123',
        title: 'Spaghetti Bolognese',
        description: 'Classic Italian pasta dish',
        cuisine: 'Italian',
        price: 12.99,
        image_url: 'https://example.com/spaghetti.jpg',
        created_at: '2025-09-10T00:00:00.000Z',
        pickup_location: 'Test Location',
        cookName: 'Chef John',
        restaurantName: 'Pasta Palace',
        isVerified: true,
        cookImage: 'https://example.com/chef.jpg',
        profiles: {
            user_id: '123',
            full_name: 'Chef John',
            profile_image: 'https://example.com/chef.jpg',
            is_verified: true,
            restaurant_name: 'Pasta Palace',
        },
    };

    it('renders title, cuisine/description, and price', () => {
        const { getByText } = render(<MealCard {...meal} />);

        expect(getByText('Spaghetti Bolognese')).toBeTruthy();
        expect(getByText('Italian')).toBeTruthy(); // or cuisine
        expect(getByText('RM 12.99')).toBeTruthy();
    });

    it('renders created_at date', () => {
        const { getByText } = render(<MealCard {...meal} />);
        expect(getByText(/Available/)).toBeTruthy();
        expect(getByText('10/09/2025')).toBeTruthy(); // Depending on locale
    });


});