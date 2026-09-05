import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeliveryAddress } from '@/src/components/delivery/DeliveryAddressModal';

export type CheckoutFulfillmentType = 'pickup' | 'delivery';

export type CheckoutDeliveryQuote = {
  jobId: string;
  cookId: string;
  cookName: string;
  subtotal: number;
  quotedFee: number;
  customerFee: number;
  freeDeliveryApplied: boolean;
  freeDeliveryThreshold: number | null;
  expiresAt: string;
  distanceMeters: number | null;
  preparationReadyAt: string;
  estimatedArrivalStart: string;
  estimatedArrivalEnd: string;
  estimatedTravelMinMinutes: number;
  estimatedTravelMaxMinutes: number;
  distanceBand: string;
};

export type CheckoutDraft = {
  version: 1;
  cartFingerprint: string;
  fulfillmentType: CheckoutFulfillmentType;
  address: DeliveryAddress | null;
  addressDefaults: Partial<DeliveryAddress>;
  quotes: CheckoutDeliveryQuote[];
  quoteExpiresAt: string | null;
  savedAt: string;
};

export const getCheckoutDraftStorageKey = (userId: string, cookId: string) =>
  `@chefin:checkout-draft:${userId}:${cookId}`;

export const parseCheckoutDraft = (
  raw: string | null,
  cartFingerprint: string,
  now = Date.now()
): CheckoutDraft | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutDraft>;
    if (
      parsed.version !== 1 ||
      (parsed.fulfillmentType !== 'pickup' && parsed.fulfillmentType !== 'delivery') ||
      typeof parsed.cartFingerprint !== 'string' ||
      typeof parsed.savedAt !== 'string'
    ) {
      return null;
    }

    const basketUnchanged = parsed.cartFingerprint === cartFingerprint;
    const quoteExpiresAt =
      basketUnchanged &&
      typeof parsed.quoteExpiresAt === 'string' &&
      new Date(parsed.quoteExpiresAt).getTime() > now
        ? parsed.quoteExpiresAt
        : null;

    return {
      version: 1,
      cartFingerprint,
      fulfillmentType: parsed.fulfillmentType,
      address: parsed.address && typeof parsed.address === 'object' ? parsed.address : null,
      addressDefaults:
        parsed.addressDefaults && typeof parsed.addressDefaults === 'object'
          ? parsed.addressDefaults
          : {},
      quotes:
        quoteExpiresAt && Array.isArray(parsed.quotes)
          ? (parsed.quotes as CheckoutDeliveryQuote[])
          : [],
      quoteExpiresAt,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
};

export const loadCheckoutDraft = async (
  userId: string,
  cookId: string,
  cartFingerprint: string
) => {
  const raw = await AsyncStorage.getItem(getCheckoutDraftStorageKey(userId, cookId));
  return parseCheckoutDraft(raw, cartFingerprint);
};

export const saveCheckoutDraft = async (
  userId: string,
  cookId: string,
  draft: Omit<CheckoutDraft, 'version' | 'savedAt'>
) => {
  const stored: CheckoutDraft = {
    ...draft,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(getCheckoutDraftStorageKey(userId, cookId), JSON.stringify(stored));
};

export const removeCheckoutDraft = (userId: string, cookId: string) =>
  AsyncStorage.removeItem(getCheckoutDraftStorageKey(userId, cookId));
