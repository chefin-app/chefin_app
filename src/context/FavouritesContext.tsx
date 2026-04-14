import React, { createContext, useCallback, useContext, useState } from 'react';

export interface FavouriteRestaurant {
  profileId: string;
  restaurantName: string;
  imageUrl?: string;
  fullChefName?: string;
  rating: string;
  reviewCount: number;
}

interface FavouritesContextType {
  favourites: FavouriteRestaurant[];
  toggleFavourite: (item: FavouriteRestaurant) => void;
  isFavourite: (profileId: string) => boolean;
}

const FavouritesContext = createContext<FavouritesContextType | undefined>(undefined);

export const FavouritesProvider = ({ children }: { children: React.ReactNode }) => {
  const [favourites, setFavourites] = useState<FavouriteRestaurant[]>([]);

  const toggleFavourite = useCallback((item: FavouriteRestaurant) => {
    setFavourites(prev => {
      const exists = prev.find(f => f.profileId === item.profileId);
      if (exists) {
        return prev.filter(f => f.profileId !== item.profileId);
      }
      return [...prev, item];
    });
  }, []);

  const isFavourite = useCallback(
    (profileId: string) => {
      return !!favourites.find(f => f.profileId === profileId);
    },
    [favourites]
  );

  return (
    <FavouritesContext.Provider value={{ favourites, toggleFavourite, isFavourite }}>
      {children}
    </FavouritesContext.Provider>
  );
};

export const useFavourites = () => {
  const ctx = useContext(FavouritesContext);
  if (!ctx) throw new Error('useFavourites must be used within a FavouritesProvider');
  return ctx;
};
