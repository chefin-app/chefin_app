import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedPaymentCard = {
  id: string;
  brand: string;
  last4: string;
  expMonth: string;
  expYear: string;
};

export type StoredPaymentMethods = {
  version: 2;
  cards: SavedPaymentCard[];
  defaultCardId: string | null;
};

type LegacySavedCard = Omit<SavedPaymentCard, 'id'>;

export const getPaymentMethodsStorageKey = (userId?: string) =>
  `@chefin:payment-method-${userId || 'guest'}`;

export const emptyPaymentMethods = (): StoredPaymentMethods => ({
  version: 2,
  cards: [],
  defaultCardId: null,
});

const isCardMetadata = (value: unknown): value is LegacySavedCard => {
  if (!value || typeof value !== 'object') return false;
  const card = value as Record<string, unknown>;
  return (
    typeof card.brand === 'string' &&
    typeof card.last4 === 'string' &&
    /^\d{4}$/.test(card.last4) &&
    typeof card.expMonth === 'string' &&
    /^(0[1-9]|1[0-2])$/.test(card.expMonth) &&
    typeof card.expYear === 'string' &&
    /^\d{2}$/.test(card.expYear)
  );
};

const legacyCardId = (card: LegacySavedCard) =>
  `legacy-${card.brand.toLowerCase().replace(/[^a-z0-9]/g, '')}-${card.last4}-${card.expMonth}${card.expYear}`;

const normaliseCard = (value: unknown): SavedPaymentCard | null => {
  if (!isCardMetadata(value)) return null;
  const stored = value as LegacySavedCard & { id?: unknown };
  return {
    id: typeof stored.id === 'string' && stored.id ? stored.id : legacyCardId(stored),
    brand: stored.brand,
    last4: stored.last4,
    expMonth: stored.expMonth,
    expYear: stored.expYear,
  };
};

/**
 * Reads both the current collection format and the original single-card format.
 * Keeping the parser here lets checkout and the settings screen migrate together.
 */
export const parsePaymentMethods = (raw: string | null): StoredPaymentMethods => {
  if (!raw) return emptyPaymentMethods();

  try {
    const parsed: unknown = JSON.parse(raw);

    const collection = parsed as { cards?: unknown; defaultCardId?: unknown } | null;
    if (collection && Array.isArray(collection.cards)) {
      const cards = collection.cards
        .map((card: unknown) => normaliseCard(card))
        .filter((card: SavedPaymentCard | null): card is SavedPaymentCard => card !== null);
      const requestedDefault = collection.defaultCardId;
      const defaultCardId =
        typeof requestedDefault === 'string' && cards.some(card => card.id === requestedDefault)
          ? requestedDefault
          : (cards[0]?.id ?? null);

      return { version: 2, cards, defaultCardId };
    }

    const legacyCard = normaliseCard(parsed);
    if (legacyCard) {
      return { version: 2, cards: [legacyCard], defaultCardId: legacyCard.id };
    }
  } catch {
    // Treat malformed local data as an empty wallet. No sensitive card data is
    // persisted, so there is nothing useful to recover from a partial record.
  }

  return emptyPaymentMethods();
};

export const loadPaymentMethods = async (userId?: string): Promise<StoredPaymentMethods> => {
  const raw = await AsyncStorage.getItem(getPaymentMethodsStorageKey(userId));
  return parsePaymentMethods(raw);
};

export const savePaymentMethods = async (
  userId: string | undefined,
  methods: StoredPaymentMethods
) => {
  await AsyncStorage.setItem(getPaymentMethodsStorageKey(userId), JSON.stringify(methods));
};

export const getDefaultPaymentCard = (methods: StoredPaymentMethods): SavedPaymentCard | null =>
  methods.cards.find(card => card.id === methods.defaultCardId) ?? methods.cards[0] ?? null;

export const createSavedPaymentCard = (
  metadata: Omit<SavedPaymentCard, 'id'>
): SavedPaymentCard => ({
  ...metadata,
  id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});
