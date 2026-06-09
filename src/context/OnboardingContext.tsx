import React, { createContext, useCallback, useContext, useState } from 'react';

/** Snapshot of the first-dish draft collected during cook onboarding. Nothing
 *  is written to the DB until the cook submits the application on the final
 *  payment-methods step. */
export interface OnboardingDish {
  title: string;
  description: string;
  ingredients: string[];
  cuisine: string | null;
  dietaryTags: string[];
  price: number;
  /** Local file URI from expo-image-picker. Uploaded on final commit. */
  photoUri: string | null;
}

/** Food-safety details collected during onboarding. */
export interface OnboardingFoodSafety {
  hostingType: 'private' | 'business' | null;
  hasLicense: boolean | null;
  /** Local file URI from expo-document-picker. Uploaded on final commit. */
  licenseUri: string | null;
  licenseMimeType: string | null;
  licenseFileName: string | null;
}

/** Kitchen address fields collected during onboarding. */
export interface OnboardingAddress {
  country: string;
  flat: string;
  property_name: string;
  street: string;
  locality: string;
  town: string;
  postcode: string;
}

interface OnboardingContextType {
  dish: OnboardingDish | null;
  address: OnboardingAddress | null;
  foodSafety: OnboardingFoodSafety | null;
  setDish: (dish: OnboardingDish) => void;
  setAddress: (address: OnboardingAddress) => void;
  setFoodSafety: (fs: OnboardingFoodSafety) => void;
  reset: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider = ({ children }: { children: React.ReactNode }) => {
  const [dish, setDishState] = useState<OnboardingDish | null>(null);
  const [address, setAddressState] = useState<OnboardingAddress | null>(null);
  const [foodSafety, setFoodSafetyState] = useState<OnboardingFoodSafety | null>(null);

  const setDish = useCallback((next: OnboardingDish) => setDishState(next), []);
  const setAddress = useCallback((next: OnboardingAddress) => setAddressState(next), []);
  const setFoodSafety = useCallback((next: OnboardingFoodSafety) => setFoodSafetyState(next), []);
  const reset = useCallback(() => {
    setDishState(null);
    setAddressState(null);
    setFoodSafetyState(null);
  }, []);

  return (
    <OnboardingContext.Provider
      value={{ dish, address, foodSafety, setDish, setAddress, setFoodSafety, reset }}
    >
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
};
