
import { supabase } from '@/src/services/supabase';
import { fetchRestaurantName } from '@/src/utils/fetchRestaurantName';

jest.mock('@/src/services/supabase', () => ({
    supabase: {
        from: jest.fn().mockReturnThis(),
        select: jest.fn(), // mock select method
        ilike: jest.fn()
    }
}));

// mock data
const mockData = [
    { restaurant_name: 'Mama Pasta' },
    { restaurant_name: 'Papa Pizza' }
];

describe('fetchRestaurantName', () => {
    it('fetches restaurant names without query', async () => {
        (supabase.from as jest.Mock).mockReturnValueOnce({
            select: jest.fn().mockResolvedValue({ data: mockData, error: null })
        });

        const result = await fetchRestaurantName({});
        //assertions
        expect(supabase.from).toHaveBeenCalledWith('profiles');
        expect(result).toEqual(mockData);
    });

    it('fetches restaurant names with query', async () => {
        const mockIlike = jest.fn().mockResolvedValue({ data: mockData, error: null });

        (supabase.from as jest.Mock).mockReturnValueOnce({
            select: jest.fn().mockReturnThis(),
            ilike: mockIlike
        });

        const result = await fetchRestaurantName({ query: 'Pasta'});
        expect(supabase.from).toHaveBeenCalledWith('profiles');
        expect(mockIlike).toHaveBeenCalledWith('restaurant_name', '%Pasta%');
        expect(result).toEqual(mockData);
    });

    it('throws error if supabase returns error', async () => {
        const mockError = { message: 'Supabase error' };
        (supabase.from as jest.Mock).mockReturnValueOnce({
            select: jest.fn().mockResolvedValue({ data: null, error: mockError })
        });
        await expect(fetchRestaurantName({})).rejects.toThrow('Supabase error');
    })
});