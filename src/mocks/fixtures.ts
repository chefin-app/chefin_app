import { MockDb, type MockRow } from '@/src/mocks/db';

export const DEMO_USER_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
export const DANIEL_USER_ID = '11111111-1111-4111-8111-111111111112';
export const DANIEL_PROFILE_ID = '22222222-2222-4222-8222-222222222223';
export const MEI_PROFILE_ID = '33333333-3333-4333-8333-333333333333';
export const PAKDIN_PROFILE_ID = '44444444-4444-4444-8444-444444444444';
export const SITI_PROFILE_ID = '55555555-5555-4555-8555-555555555555';

export const NASI_LEMAK_ID = '66666666-6666-4666-8666-666666666661';
export const AYAM_ID = '66666666-6666-4666-8666-666666666662';
export const WONTON_ID = '66666666-6666-4666-8666-666666666663';
export const SATAY_ID = '66666666-6666-4666-8666-666666666664';
export const KUIH_ID = '66666666-6666-4666-8666-666666666665';

export const INCOMING_ORDER_ID = '77777777-7777-4777-8777-777777777771';
export const ACTIVE_ORDER_ID = '77777777-7777-4777-8777-777777777772';
export const COMPLETED_ORDER_ID = '77777777-7777-4777-8777-777777777773';

const FOOD = {
  nasi: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80',
  ayam: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=800&q=80',
  wonton:
    'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=800&q=80',
  satay:
    'https://images.unsplash.com/photo-1529563021893-cc83c992d75d?auto=format&fit=crop&w=800&q=80',
  kuih: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80',
  aisha:
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
  mei: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80',
  pakdin:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
  siti: 'https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=400&q=80',
};

export const malaysiaDateKey = (offsetDays = 0): string => {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const hoursFromNow = (hours: number): string =>
  new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const windowFor = (listingId: string, offsetDays: number): MockRow => {
  const date = malaysiaDateKey(offsetDays);
  return {
    id: `${listingId}-day-${offsetDays}`,
    listing_id: listingId,
    available_date: date,
    start_time: `${date}T00:00:00+08:00`,
    end_time: `${date}T23:59:00+08:00`,
    is_available: true,
    max_orders: 20,
    orders_taken: 1,
  };
};

const profile = (row: MockRow): MockRow => ({
  onboarding_completed: true,
  account_status: 'active',
  is_verified: true,
  store_status: 'open',
  store_busy_prep_minutes: 15,
  store_paused_until: null,
  has_food_safety_license: true,
  phone_number: '+60123456789',
  bio: 'Home cooking from a verified Chefin cook.',
  address_locality: 'Bangsar',
  address_town: 'Kuala Lumpur',
  address_postcode: '59100',
  free_delivery_threshold: 40,
  created_at: '2026-01-12T02:00:00.000Z',
  ...row,
});

const dish = (row: MockRow): MockRow => ({
  description: 'Cooked this morning in a home kitchen.',
  dietary_tags: [],
  ingredients: [],
  location: 'Bangsar, Kuala Lumpur',
  status: 'approved',
  is_active: true,
  menu_category: 'Mains',
  created_at: '2026-02-01T02:00:00.000Z',
  ...row,
});

export const createMockTables = (): Record<string, MockRow[]> => {
  const today = malaysiaDateKey(0);
  const profiles: MockRow[] = [
    profile({
      id: DEMO_PROFILE_ID,
      user_id: DEMO_USER_ID,
      full_name: 'Aisha Rahman',
      restaurant_name: "Aisha's Kitchen",
      profile_image: FOOD.aisha,
      bio: 'Nasi lemak and ayam goreng from a home kitchen in Bangsar.',
    }),
    profile({
      id: DANIEL_PROFILE_ID,
      user_id: DANIEL_USER_ID,
      full_name: 'Daniel Lim',
      restaurant_name: null,
      profile_image: null,
      bio: null,
      has_food_safety_license: false,
    }),
    profile({
      id: MEI_PROFILE_ID,
      user_id: '11111111-1111-4111-8111-111111111113',
      full_name: 'Mei Tan',
      restaurant_name: "Mei's Noodles",
      profile_image: FOOD.mei,
      bio: 'Family wonton noodles, made to order.',
      address_locality: 'Petaling Jaya',
    }),
    profile({
      id: PAKDIN_PROFILE_ID,
      user_id: '11111111-1111-4111-8111-111111111114',
      full_name: 'Pak Din',
      restaurant_name: "Pak Din's Grill",
      profile_image: FOOD.pakdin,
      bio: 'Satay and grilled chicken, weekends and weeknights.',
      address_locality: 'Shah Alam',
    }),
    profile({
      id: SITI_PROFILE_ID,
      user_id: '11111111-1111-4111-8111-111111111115',
      full_name: 'Siti Aminah',
      restaurant_name: "Siti's Sweets",
      profile_image: FOOD.siti,
      bio: 'Kuih and cakes baked the same day.',
      address_locality: 'Ampang',
    }),
  ];

  const listings: MockRow[] = [
    dish({
      id: NASI_LEMAK_ID,
      cook_id: DEMO_PROFILE_ID,
      title: 'Nasi lemak ayam',
      description: 'Coconut rice, sambal, egg, peanuts, and fried chicken.',
      price: 14,
      image_url: FOOD.nasi,
      cuisine: 'Malay',
      ingredients: ['coconut rice', 'sambal', 'chicken', 'egg'],
    }),
    dish({
      id: AYAM_ID,
      cook_id: DEMO_PROFILE_ID,
      title: 'Ayam goreng berempah',
      description: 'Spiced fried chicken with rice.',
      price: 12,
      image_url: FOOD.ayam,
      cuisine: 'Malay',
    }),
    dish({
      id: WONTON_ID,
      cook_id: MEI_PROFILE_ID,
      title: 'Wonton mee',
      description: 'Springy noodles, char siu, and shrimp wontons.',
      price: 13,
      image_url: FOOD.wonton,
      cuisine: 'Chinese',
      location: 'Petaling Jaya',
    }),
    dish({
      id: SATAY_ID,
      cook_id: PAKDIN_PROFILE_ID,
      title: 'Chicken satay (10 sticks)',
      description: 'Grilled chicken satay with peanut sauce.',
      price: 16,
      image_url: FOOD.satay,
      cuisine: 'Malay',
      location: 'Shah Alam',
    }),
    dish({
      id: KUIH_ID,
      cook_id: SITI_PROFILE_ID,
      title: 'Kuih lapis box',
      description: 'A box of steamed layer cake.',
      price: 18,
      image_url: FOOD.kuih,
      cuisine: 'Malay',
      menu_category: 'Dessert',
      location: 'Ampang',
    }),
  ];

  const reviews: MockRow[] = [
    {
      id: '88888888-8888-4888-8888-888888888881',
      customer_id: DANIEL_PROFILE_ID,
      listing_id: NASI_LEMAK_ID,
      order_id: null,
      rating: 5,
      comment: 'Sambal was excellent.',
      created_at: '2026-09-02T04:00:00.000Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888882',
      customer_id: DANIEL_PROFILE_ID,
      listing_id: WONTON_ID,
      order_id: null,
      rating: 4,
      comment: 'Noodles were springy.',
      created_at: '2026-09-04T04:00:00.000Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888883',
      customer_id: DEMO_PROFILE_ID,
      listing_id: KUIH_ID,
      order_id: COMPLETED_ORDER_ID,
      rating: 5,
      comment: 'Fresh and not too sweet.',
      created_at: '2026-09-20T04:00:00.000Z',
    },
    {
      id: '88888888-8888-4888-8888-888888888884',
      customer_id: DANIEL_PROFILE_ID,
      listing_id: SATAY_ID,
      order_id: null,
      rating: 5,
      comment: 'Peanut sauce was rich.',
      created_at: '2026-08-18T04:00:00.000Z',
    },
  ];

  const pickupSoon = hoursFromNow(2);
  const pickupEnd = hoursFromNow(2.5);
  const orders: MockRow[] = [
    {
      id: INCOMING_ORDER_ID,
      customer_id: DANIEL_PROFILE_ID,
      listing_id: NASI_LEMAK_ID,
      quantity: 2,
      total_price: 28,
      scheduled_date: today,
      pickup_time: pickupSoon,
      pickup_window_end: pickupEnd,
      customer_note: 'Less spicy if possible.',
      selected_options: [],
      fulfillment_type: 'pickup',
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString(),
      checkout_id: INCOMING_ORDER_ID,
    },
    {
      id: ACTIVE_ORDER_ID,
      customer_id: DEMO_PROFILE_ID,
      listing_id: WONTON_ID,
      quantity: 1,
      total_price: 13,
      scheduled_date: today,
      pickup_time: pickupSoon,
      pickup_window_end: pickupEnd,
      customer_note: null,
      selected_options: [],
      fulfillment_type: 'pickup',
      status: 'confirmed',
      payment_status: 'pending',
      created_at: new Date().toISOString(),
      checkout_id: ACTIVE_ORDER_ID,
    },
    {
      id: COMPLETED_ORDER_ID,
      customer_id: DEMO_PROFILE_ID,
      listing_id: KUIH_ID,
      quantity: 1,
      total_price: 18,
      scheduled_date: malaysiaDateKey(-10),
      pickup_time: '2026-09-20T04:00:00.000Z',
      pickup_window_end: '2026-09-20T05:00:00.000Z',
      customer_note: null,
      selected_options: [],
      fulfillment_type: 'pickup',
      status: 'completed',
      payment_status: 'paid',
      completed_at: '2026-09-20T05:10:00.000Z',
      created_at: '2026-09-20T02:00:00.000Z',
      checkout_id: COMPLETED_ORDER_ID,
    },
  ];

  return {
    profiles,
    listings,
    reviews,
    orders,
    delivery_jobs: [],
    notifications: [
      {
        id: '99999999-9999-4999-8999-999999999991',
        user_id: DEMO_USER_ID,
        recipient_role: 'cook',
        type: 'new_order',
        title: 'New order',
        body: 'Daniel ordered 2 nasi lemak ayam.',
        data: { orderId: INCOMING_ORDER_ID },
        read: false,
        created_at: new Date().toISOString(),
      },
      {
        id: '99999999-9999-4999-8999-999999999992',
        user_id: DEMO_USER_ID,
        recipient_role: 'customer',
        type: 'order_confirmed',
        title: 'Order confirmed',
        body: 'Mei accepted your wonton mee.',
        data: { orderId: ACTIVE_ORDER_ID },
        read: false,
        created_at: new Date().toISOString(),
      },
    ],
    favourites: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        user_id: DEMO_USER_ID,
        cook_profile_id: MEI_PROFILE_ID,
        restaurant_name: "Mei's Noodles",
        image_url: FOOD.mei,
        chef_name: 'Mei Tan',
        rating: '4.0',
        review_count: 1,
        created_at: '2026-09-01T02:00:00.000Z',
      },
    ],
    availability: listings.flatMap(listing => [
      windowFor(String(listing.id), 0),
      windowFor(String(listing.id), 1),
    ]),
    cook_applications: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        user_id: DEMO_USER_ID,
        status: 'approved',
        identity_status: 'approved',
        compliance_status: 'approved',
        citizenship_type: 'citizen',
        submitted_at: '2026-01-10T02:00:00.000Z',
        reviewer_note: null,
        reverification_due_at: null,
        reverification_identity_submitted_at: null,
        reverification_food_submitted_at: null,
        reverification_food_skipped_at: null,
      },
    ],
    user_roles: [
      { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', user_id: DEMO_USER_ID, role: 'cook' },
      { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', user_id: DEMO_USER_ID, role: 'customer' },
      { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3', user_id: DEMO_USER_ID, role: 'admin' },
    ],
    cook_payment_settings: [
      DEMO_PROFILE_ID,
      MEI_PROFILE_ID,
      PAKDIN_PROFILE_ID,
      SITI_PROFILE_ID,
    ].map(cookId => ({
      cook_id: cookId,
      qr_enabled: true,
      collection_enabled: true,
      recipient_name: profiles.find(item => item.id === cookId)?.full_name,
      qr_image: FOOD.nasi,
    })),
    direct_payments: [
      {
        order_id: INCOMING_ORDER_ID,
        method: 'cook_qr',
        state: 'awaiting_acceptance',
        amount: 28,
        recipient_name: 'Aisha Rahman',
        qr_image: FOOD.nasi,
        reference: null,
        accepted_at: null,
        deadline: null,
        confirmed_at: null,
      },
      {
        order_id: ACTIVE_ORDER_ID,
        method: 'pay_on_collection',
        state: 'due_on_collection',
        amount: 13,
        recipient_name: 'Mei Tan',
        qr_image: null,
        reference: null,
        accepted_at: new Date().toISOString(),
        deadline: null,
        confirmed_at: null,
      },
    ],
    customer_location_preferences: [
      {
        user_id: DEMO_USER_ID,
        label: 'Bangsar, Kuala Lumpur',
        latitude: 3.129,
        longitude: 101.684,
        source: 'manual',
        prompted_at: '2026-10-01T02:00:00.000Z',
        consented_at: '2026-10-01T02:00:00.000Z',
        updated_at: '2026-10-01T02:00:00.000Z',
      },
    ],
    customer_delivery_addresses: [],
    menu_option_groups: [
      {
        id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        cook_id: DEMO_PROFILE_ID,
        name: 'Spice level',
        selection_type: 'single',
        min_select: 1,
        max_select: 1,
        is_active: true,
        archived_at: null,
        created_at: '2026-02-01T02:00:00.000Z',
      },
    ],
    menu_options: [
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
        group_id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        name: 'Mild',
        price_delta: 0,
        is_available: true,
        sort_order: 1,
        archived_at: null,
      },
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
        group_id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        name: 'Extra sambal',
        price_delta: 2,
        is_available: true,
        sort_order: 2,
        archived_at: null,
      },
    ],
    listing_option_groups: [
      {
        id: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
        group_id: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
        listing_id: NASI_LEMAK_ID,
        sort_order: 1,
      },
    ],
    verification_documents: [
      {
        id: '12121212-1212-4212-8212-121212121212',
        user_id: DEMO_USER_ID,
        doc_type: 'food_handler_certificate',
        status: 'approved',
      },
      {
        id: '12121212-1212-4212-8212-121212121213',
        user_id: DEMO_USER_ID,
        doc_type: 'fosim_registration',
        status: 'approved',
      },
    ],
    cook_compliance_acceptances: [],
    restaurant_opening_hours: [1, 2, 3, 4, 5, 6, 7].map(day => ({
      id: `13131313-1313-4131-8131-13131313113${day}`,
      cook_id: DEMO_PROFILE_ID,
      iso_weekday: day,
      opens_at: '08:00',
      closes_at: '22:00',
      enabled: true,
    })),
  };
};

export const mockDb = new MockDb(createMockTables());

export const resetMockDb = (): void => {
  mockDb.tables = createMockTables();
};
