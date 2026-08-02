import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/src/utils/supabaseClient';
import { useAuth } from '@/src/services/auth-context';
import { formatPersistedRating, formatRating, getRatingSummary } from '@/src/utils/ratings';

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

/** DB row → display shape. Rows carry a denormalised snapshot of the
 *  restaurant card so this list renders without extra joins. */
const rowToFavourite = (row: any): FavouriteRestaurant => ({
  profileId: row.cook_profile_id,
  restaurantName: row.restaurant_name ?? '',
  imageUrl: row.image_url ?? undefined,
  fullChefName: row.chef_name ?? undefined,
  rating: formatPersistedRating(row.rating),
  reviewCount: row.review_count ?? 0,
});

/**
 * Favourites persist to the `favourites` table for signed-in users (so they
 * survive restarts, and the backend can notify favouriters when a cook adds
 * a dish or new pickup slots). Guests keep session-only favourites.
 */
export const FavouritesProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [favourites, setFavourites] = useState<FavouriteRestaurant[]>([]);

  useEffect(() => {
    if (!userId) {
      setFavourites([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('favourites')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Could not load favourites', error.message);
        return;
      }

      let loadedFavourites = (data ?? []).map(rowToFavourite);
      const cookIds = [...new Set(loadedFavourites.map(item => item.profileId).filter(Boolean))];

      if (cookIds.length > 0) {
        const { data: ratingRows, error: ratingError } = await supabase
          .from('listings')
          .select('cook_id, reviews(rating)')
          .in('cook_id', cookIds)
          .eq('status', 'approved')
          .eq('is_active', true);

        if (ratingError) {
          // The denormalised snapshot is still a safe display fallback if the
          // live aggregate cannot be refreshed.
          console.warn('Could not refresh favourite ratings', ratingError.message);
        } else {
          const reviewsByCook = new Map<string, Array<{ rating?: unknown }>>();
          for (const row of ratingRows ?? []) {
            const current = reviewsByCook.get(row.cook_id) ?? [];
            current.push(...(row.reviews ?? []));
            reviewsByCook.set(row.cook_id, current);
          }

          loadedFavourites = loadedFavourites.map(item => {
            const summary = getRatingSummary(reviewsByCook.get(item.profileId));
            return {
              ...item,
              rating: formatRating(summary.average),
              reviewCount: summary.count,
            };
          });
        }
      }

      if (!cancelled) setFavourites(loadedFavourites);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggleFavourite = useCallback(
    (item: FavouriteRestaurant) => {
      let removed = false;
      // Optimistic flip; persistence follows for signed-in users.
      setFavourites(prev => {
        const exists = prev.find(f => f.profileId === item.profileId);
        if (exists) {
          removed = true;
          return prev.filter(f => f.profileId !== item.profileId);
        }
        return [...prev, item];
      });

      if (!userId) return;
      (async () => {
        try {
          if (removed) {
            const { error } = await supabase
              .from('favourites')
              .delete()
              .eq('user_id', userId)
              .eq('cook_profile_id', item.profileId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('favourites').insert({
              user_id: userId,
              cook_profile_id: item.profileId,
              restaurant_name: item.restaurantName || null,
              image_url: item.imageUrl ?? null,
              chef_name: item.fullChefName ?? null,
              rating: item.rating ?? null,
              review_count: item.reviewCount ?? 0,
            });
            if (error) throw error;
          }
        } catch (e: any) {
          console.warn('Could not save favourite', e.message ?? e);
          // Roll the optimistic change back so the heart reflects reality.
          setFavourites(prev =>
            removed ? [...prev, item] : prev.filter(f => f.profileId !== item.profileId)
          );
        }
      })();
    },
    [userId]
  );

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
