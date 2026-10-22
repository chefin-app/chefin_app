import { nextMockId, type MockRow } from '@/src/mocks/db';
import { DEMO_PROFILE_ID, DEMO_USER_ID, mockDb } from '@/src/mocks/fixtures';

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const json = (body: unknown, status = 200): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const readBody = (init?: RequestInit): Record<string, unknown> => {
  if (typeof init?.body !== 'string' || !init.body) return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const profileById = (id: string): MockRow | undefined =>
  mockDb.rows('profiles').find(profile => profile.id === id);

const listingById = (id: string): MockRow | undefined =>
  mockDb.rows('listings').find(listing => listing.id === id);

const reviewsFor = (listingId: string): MockRow[] =>
  mockDb.rows('reviews').filter(review => review.listing_id === listingId);

const availabilityFor = (listingId: string): MockRow[] =>
  mockDb.rows('availability').filter(record => record.listing_id === listingId);

const optionGroupsFor = (listingId: string) => {
  const links = mockDb.rows('listing_option_groups').filter(link => link.listing_id === listingId);
  return links.map(link => {
    const group = mockDb.rows('menu_option_groups').find(item => item.id === link.group_id);
    const options = mockDb
      .rows('menu_options')
      .filter(option => option.group_id === link.group_id)
      .map(option => ({
        id: option.id,
        name: option.name,
        priceDelta: Number(option.price_delta ?? 0),
        isAvailable: option.is_available !== false,
        availabilityStatus: 'in_stock',
        sortOrder: option.sort_order,
      }));
    return {
      id: group?.id,
      name: group?.name,
      selectionType: group?.selection_type ?? 'single',
      minSelect: group?.min_select ?? 0,
      maxSelect: group?.max_select ?? 1,
      required: Number(group?.min_select ?? 0) > 0,
      sortOrder: link.sort_order,
      options,
    };
  });
};

const discoveryRow = (listing: MockRow, distanceLabel = '1–3 km away') => {
  const cookListings = mockDb.rows('listings').filter(item => item.cook_id === listing.cook_id);
  const cookReviews = cookListings.flatMap(item => reviewsFor(String(item.id)));
  return {
    ...listing,
    profiles: profileById(String(listing.cook_id)) ?? null,
    reviews: reviewsFor(String(listing.id)).map(review => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
    })),
    restaurant_reviews: cookReviews.map(review => ({ rating: review.rating })),
    restaurant_listing_ids: cookListings.map(item => item.id),
    distance_label: distanceLabel,
  };
};

const visibleListings = (query?: string, cuisine?: string): MockRow[] => {
  const normalizedQuery = query?.trim().toLowerCase() ?? '';
  const normalizedCuisine = cuisine?.trim().toLowerCase() ?? '';
  return mockDb
    .rows('listings')
    .filter(listing => listing.status === 'approved' && listing.is_active === true)
    .filter(listing => {
      if (!normalizedCuisine || normalizedCuisine === 'all') return true;
      return String(listing.cuisine ?? '').toLowerCase() === normalizedCuisine;
    })
    .filter(listing => {
      if (!normalizedQuery) return true;
      const profile = profileById(String(listing.cook_id));
      return [
        listing.title,
        listing.description,
        listing.cuisine,
        profile?.full_name,
        profile?.restaurant_name,
      ].some(value =>
        String(value ?? '')
          .toLowerCase()
          .includes(normalizedQuery)
      );
    })
    .map((listing, index) =>
      discoveryRow(
        listing,
        ['Less than 1 km away', '1–3 km away', '3–5 km away', '5–10 km away'][index % 4]
      )
    );
};

const openingHours = () =>
  [1, 2, 3, 4, 5, 6, 7].map(isoWeekday => ({
    isoWeekday,
    opensAt: '08:00',
    closesAt: '22:00',
    enabled: true,
  }));

const cookMenu = () => ({
  date: new Date().toISOString().slice(0, 10),
  openingHours: openingHours(),
  specialHours: [],
  sellingSchedules: [],
  dishes: mockDb
    .rows('listings')
    .filter(listing => listing.cook_id === DEMO_PROFILE_ID)
    .map(listing => ({
      id: listing.id,
      listingId: listing.id,
      title: listing.title,
      price: Number(listing.price),
      imageUrl: listing.image_url,
      status: listing.status,
      menuCategory: listing.menu_category,
      isActive: listing.is_active,
      sellingScheduleId: null,
      configured: true,
      enabled: true,
      availableToday: true,
      state: 'available',
      dailyStockLimit: 20,
      portionsReservedToday: 1,
      remainingStockToday: 19,
      inventoryDepleted: false,
      availability: {
        configured: true,
        enabled: true,
        availableToday: true,
        state: 'available',
        dailyStockLimit: 20,
        portionsReservedToday: 1,
        remainingStockToday: 19,
        inventoryDepleted: false,
        currentlyAvailable: true,
        source: 'recurring',
      },
    })),
});

const paymentView = (orderId: string) => {
  const payment = mockDb.rows('direct_payments').find(item => item.order_id === orderId);
  const order = mockDb.rows('orders').find(item => item.id === orderId);
  const listing = order ? listingById(String(order.listing_id)) : undefined;
  if (!payment || !order) return null;
  return {
    method: payment.method,
    state: payment.state,
    amount: Number(payment.amount),
    recipientName: payment.recipient_name,
    qrImage: payment.qr_image,
    reference: payment.reference,
    acceptedAt: payment.accepted_at,
    deadline: payment.deadline,
    confirmedAt: payment.confirmed_at,
    isCook: listing?.cook_id === DEMO_PROFILE_ID,
    closed: order.status === 'cancelled' || order.status === 'completed',
    allReady: order.status === 'ready' || order.status === 'completed',
    delivery: order.fulfillment_type === 'delivery',
    refund: null,
  };
};

const placeOrder = (body: Record<string, unknown>) => {
  const items = Array.isArray(body.items) ? body.items : [];
  const created = items.map(item => {
    const listing = listingById(String((item as MockRow).listingId));
    const quantity = Number((item as MockRow).quantity ?? 1);
    const price = Number((item as MockRow).priceAtOrder ?? listing?.price ?? 0);
    const order: MockRow = {
      id: nextMockId(),
      customer_id: DEMO_PROFILE_ID,
      listing_id: listing?.id,
      quantity,
      total_price: price * quantity,
      scheduled_date: (item as MockRow).pickupDate,
      pickup_time: (item as MockRow).pickupTime,
      pickup_window_end: (item as MockRow).pickupWindowEnd,
      customer_note: (item as MockRow).customerNote ?? null,
      selected_options: (item as MockRow).selectedOptions ?? [],
      fulfillment_type: body.fulfillmentType ?? 'pickup',
      status: 'pending',
      payment_status: 'pending',
      created_at: new Date().toISOString(),
    };
    mockDb.rows('orders').unshift(order);
    const saved = mockDb.rows('orders')[0];
    mockDb.rows('direct_payments').unshift({
      order_id: saved.id,
      method: body.paymentMethod ?? 'cook_qr',
      state:
        body.paymentMethod === 'pay_on_collection' ? 'due_on_collection' : 'awaiting_acceptance',
      amount: saved.total_price,
      recipient_name: profileById(String(listing?.cook_id))?.full_name ?? 'Cook',
      qr_image:
        'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&q=80',
      reference: null,
      accepted_at: null,
      deadline: null,
      confirmed_at: null,
    });
    mockDb.rows('notifications').unshift({
      id: nextMockId(),
      user_id: DEMO_USER_ID,
      recipient_role: 'customer',
      type: 'order_placed',
      title: 'Order placed',
      body: `Your order for ${listing?.title ?? 'a dish'} is waiting for the cook.`,
      data: { orderId: saved.id },
      read: false,
      created_at: new Date().toISOString(),
    });
    return saved;
  });
  return created;
};

const restaurantPayload = (id: string) => {
  const profile = profileById(id);
  if (!profile) return null;
  const listings = mockDb
    .rows('listings')
    .filter(listing => listing.cook_id === id && listing.status === 'approved' && listing.is_active)
    .map(listing => ({
      ...listing,
      reviews: reviewsFor(String(listing.id)).map(review => ({
        listing_id: listing.id,
        rating: review.rating,
      })),
      option_groups: optionGroupsFor(String(listing.id)),
      availability: {
        records: availabilityFor(String(listing.id)),
        source: 'recurring',
        currentlyAvailable: true,
        remainingSlots: 19,
        constrainedBySellingSchedule: false,
      },
    }));
  return {
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      restaurant_name: profile.restaurant_name,
      profile_image: profile.profile_image,
      bio: profile.bio,
      is_verified: profile.is_verified,
      free_delivery_threshold: profile.free_delivery_threshold,
    },
    listings,
    storeStatus: profile.store_status ?? 'open',
    busyPrepMinutes: profile.store_status === 'busy' ? profile.store_busy_prep_minutes : null,
    pausedUntil: profile.store_status === 'paused' ? profile.store_paused_until : null,
  };
};

const demoAuthSession = () => ({
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  token_type: 'bearer',
  user: {
    id: DEMO_USER_ID,
    email: 'aisha@chefin.app',
    phone: '+60123456789',
  },
});

const handle = async (
  method: string,
  pathname: string,
  url: URL,
  body: Record<string, unknown>
) => {
  if (method === 'POST' && pathname === '/api/auth/check-email') {
    return json({ exists: true });
  }
  if (method === 'POST' && pathname === '/api/auth/sign-in-phone') {
    return json({ success: true });
  }
  if (method === 'POST' && pathname === '/api/auth/verify-otp') {
    const session = demoAuthSession();
    return json({ success: true, session, user: session.user });
  }
  if (method === 'GET' && pathname === '/api/listings/all-listings') {
    return json(visibleListings(url.searchParams.get('query') ?? undefined));
  }
  if (method === 'GET' && pathname === '/api/home/popular-chefin-listings') {
    return json(visibleListings());
  }
  if (method === 'POST' && pathname === '/api/home/nearest-chefin-listings') {
    return json(visibleListings(String(body.query ?? ''), String(body.cuisine ?? '')));
  }
  if (method === 'POST' && pathname === '/api/availability/batch') {
    const listingIds = Array.isArray(body.listingIds) ? body.listingIds.map(String) : [];
    const availability = listingIds.flatMap(listingId => availabilityFor(listingId));
    return json({
      availability,
      summaries: Object.fromEntries(
        listingIds.map(listingId => [
          listingId,
          {
            currentlyAvailable: true,
            remainingSlots: 19,
            source: 'recurring',
            constrainedBySellingSchedule: false,
          },
        ])
      ),
    });
  }
  if (method === 'GET' && pathname === '/api/availability/cook/menu') return json(cookMenu());
  if (method === 'GET' && pathname === '/api/availability/cook/opening-hours') {
    return json({ openingHours: openingHours(), specialHours: [] });
  }
  if (method === 'GET' && pathname === '/api/availability/cook/store-status') {
    const profile = profileById(DEMO_PROFILE_ID);
    return json({
      storeStatus: profile?.store_status ?? 'open',
      busyPrepMinutes: profile?.store_busy_prep_minutes ?? 15,
      pausedUntil: profile?.store_paused_until ?? null,
    });
  }
  if (method === 'PATCH' && pathname === '/api/availability/cook/store-status') {
    const profile = profileById(DEMO_PROFILE_ID);
    if (profile) {
      profile.store_status = body.status ?? profile.store_status;
      if (body.busyPrepMinutes != null) profile.store_busy_prep_minutes = body.busyPrepMinutes;
      profile.store_paused_until = body.pausedUntil ?? null;
    }
    return json({ success: true, storeStatus: profile?.store_status ?? 'open' });
  }

  const availabilityMatch = pathname.match(/^\/api\/availability\/([^/]+)$/);
  if (method === 'GET' && availabilityMatch && availabilityMatch[1] !== 'cook') {
    const records = availabilityFor(availabilityMatch[1]);
    return json({
      available: records.length > 0,
      currentlyAvailable: records.length > 0,
      remainingSlots: 19,
      source: 'recurring',
      constrainedBySellingSchedule: false,
      availability: records,
    });
  }

  const profileMatch = pathname.match(/^\/api\/id\/([^/]+)\/profile$/);
  if (method === 'GET' && profileMatch) {
    const profile = profileById(profileMatch[1]);
    if (!profile) return json({ error: 'Restaurant not found.' }, 404);
    const listings = mockDb.rows('listings').filter(listing => listing.cook_id === profile.id);
    return json({
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        restaurant_name: profile.restaurant_name,
        profile_image: profile.profile_image,
        bio: profile.bio,
        is_verified: profile.is_verified,
      },
      areaAddress: [profile.address_locality, profile.address_town, profile.address_postcode]
        .filter(Boolean)
        .join(', '),
      openingHours: openingHours(),
      achievements: {
        foodSafetyLicense: true,
        foodHandlerCertificate: true,
        fosimRegistration: true,
        typhoidVaccination: false,
      },
      cuisines: [...new Set(listings.map(listing => listing.cuisine).filter(Boolean))],
      topPicks: listings.slice(0, 6).map(listing => ({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        image_url: listing.image_url,
        cuisine: listing.cuisine,
        orderCount: 3,
        avgRating: 5,
        reviewCount: reviewsFor(String(listing.id)).length,
        badge: 'Top rated',
      })),
      reviews: listings.flatMap(listing =>
        reviewsFor(String(listing.id)).map(review => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          dishTitle: listing.title,
          reviewerName: profileById(String(review.customer_id))?.full_name ?? 'Customer',
        }))
      ),
      distanceLabel: '1–3 km',
    });
  }

  const restaurantMatch = pathname.match(/^\/api\/id\/([^/]+)$/);
  if (method === 'GET' && restaurantMatch) {
    const payload = restaurantPayload(restaurantMatch[1]);
    return payload ? json(payload) : json({ error: 'Restaurant not found.' }, 404);
  }

  const listingMatch = pathname.match(/^\/api\/listings\/([^/]+)$/);
  if (method === 'GET' && listingMatch && listingMatch[1] !== 'all-listings') {
    const listing = listingById(listingMatch[1]);
    if (!listing) return json({ error: 'Listing not found.' }, 404);
    return json({
      ...discoveryRow(listing),
      option_groups: optionGroupsFor(String(listing.id)),
    });
  }

  if (method === 'GET' && pathname === '/api/account/status') {
    return json({
      account: {
        userId: DEMO_USER_ID,
        profileId: DEMO_PROFILE_ID,
        status: 'active',
        suspensionReason: null,
        suspensionEndsAt: null,
      },
    });
  }
  if (method === 'GET' && pathname === '/api/account/location') {
    const preference = mockDb
      .rows('customer_location_preferences')
      .find(item => item.user_id === DEMO_USER_ID);
    return json({
      preference: preference
        ? {
            label: preference.label,
            latitude: Number(preference.latitude),
            longitude: Number(preference.longitude),
            source: preference.source,
            promptedAt: preference.prompted_at,
            consentedAt: preference.consented_at,
            updatedAt: preference.updated_at,
          }
        : null,
    });
  }
  if (method === 'PUT' && pathname === '/api/account/location') {
    const now = new Date().toISOString();
    const next = {
      user_id: DEMO_USER_ID,
      label: body.label ?? 'Selected area',
      latitude: body.latitude,
      longitude: body.longitude,
      source: body.source ?? 'manual',
      prompted_at: now,
      consented_at: now,
      updated_at: now,
    };
    const existing = mockDb
      .rows('customer_location_preferences')
      .find(item => item.user_id === DEMO_USER_ID);
    if (existing) Object.assign(existing, next);
    else mockDb.rows('customer_location_preferences').push(next);
    return json({
      success: true,
      preference: {
        label: next.label,
        latitude: Number(next.latitude),
        longitude: Number(next.longitude),
        source: next.source,
        promptedAt: now,
        consentedAt: now,
        updatedAt: now,
      },
    });
  }
  if (method === 'GET' && pathname === '/api/account/favourites/availability') {
    return json({
      restaurants: mockDb.rows('favourites').map(favourite => ({
        cookProfileId: favourite.cook_profile_id,
        regionId: 'klang-valley',
      })),
    });
  }
  if (method === 'GET' && pathname === '/api/account/cook-performance') {
    const profile = profileById(DEMO_PROFILE_ID);
    const completed = mockDb.rows('orders').filter(order => {
      const listing = listingById(String(order.listing_id));
      return listing?.cook_id === DEMO_PROFILE_ID && order.status === 'completed';
    });
    return json({
      profile: {
        fullName: profile?.full_name ?? null,
        restaurantName: profile?.restaurant_name ?? null,
        imageUrl: profile?.profile_image ?? null,
      },
      performance: {
        totalEarned: 86,
        grossFoodEarnings: 86,
        deliveryChargesCovered: 0,
        ordersFulfilled: Math.max(completed.length, 4),
        averageRating: 4.8,
        ratingCount: 6,
        completionRate: 96,
        averageEarningsPerOrder: 21.5,
        last30DaysEarned: 42,
        last30DaysOrders: 2,
      },
    });
  }
  if (method === 'GET' && pathname === '/api/cook-applications/status') {
    const application = mockDb
      .rows('cook_applications')
      .find(item => item.user_id === DEMO_USER_ID);
    return json({
      application,
      eligibility: { eligibleToSell: true, restrictedToDrafts: false },
    });
  }
  if (method === 'GET' && pathname === '/api/customer-reviews/me/summary') {
    return json({ average: 4.8 });
  }
  if (method === 'GET' && pathname === '/api/customer-reviews/status') {
    return json({ reviewedOrderIds: [] });
  }
  if (method === 'GET' && pathname === '/api/delivery/address') {
    const profile = profileById(DEMO_PROFILE_ID);
    return json({
      address: null,
      defaults: {
        recipientName: profile?.full_name ?? '',
        phoneNumber: profile?.phone_number ?? '',
      },
    });
  }
  if (method === 'POST' && pathname === '/api/delivery/quote') {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const firstItem = Array.isArray(body.items)
      ? (body.items[0] as MockRow | undefined)
      : undefined;
    const quotedListing = firstItem ? listingById(String(firstItem.listingId)) : undefined;
    const quotedCook = quotedListing ? profileById(String(quotedListing.cook_id)) : undefined;
    return json(
      {
        quotes: [
          {
            jobId: '99999999-9999-4999-8999-999999999999',
            cookId: quotedCook?.id ?? DEMO_PROFILE_ID,
            cookName: quotedCook?.restaurant_name ?? quotedCook?.full_name ?? "Aisha's Kitchen",
            subtotal: 14,
            quotedFee: 8,
            customerFee: 8,
            freeDeliveryApplied: false,
            expiresAt,
            estimatedArrivalStart: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
            estimatedArrivalEnd: new Date(Date.now() + 70 * 60 * 1000).toISOString(),
          },
        ],
        totalCustomerFee: 8,
        expiresAt,
      },
      201
    );
  }
  if (method === 'POST' && pathname === '/api/orders/cart-status') {
    const items = Array.isArray(body.items) ? (body.items as MockRow[]) : [];
    const cookIds = [...new Set(items.map(item => String(item.cookId)))];
    return json({
      baskets: cookIds.map(cookId => {
        const cook = profileById(cookId);
        const cookItems = items.filter(item => String(item.cookId) === cookId);
        return {
          cookId,
          restaurantName: cook?.restaurant_name || cook?.full_name || 'Home restaurant',
          restaurantImage: cook?.profile_image ?? null,
          status: 'ready',
          message: null,
          items: cookItems.map(item => ({
            listingId: String(item.listingId),
            status: 'ready',
            reason: null,
          })),
        };
      }),
    });
  }
  if (method === 'POST' && pathname === '/api/orders') {
    return json({ success: true, orders: placeOrder(body) }, 201);
  }
  if (method === 'GET' && pathname === '/api/orders') return json(mockDb.rows('orders'));

  const orderStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (method === 'PATCH' && orderStatusMatch) {
    const order = mockDb.rows('orders').find(item => item.id === orderStatusMatch[1]);
    if (order && body.status) order.status = body.status;
    return json({ success: true, order, directPayment: true });
  }
  const handoffMatch = pathname.match(/^\/api\/orders\/([^/]+)\/pickup-handoff$/);
  if (method === 'GET' && handoffMatch) {
    return json({ handoff: { code: '482913', canRegenerate: true } });
  }
  if (method === 'POST' && pathname.endsWith('/pickup-handoff/regenerate')) {
    return json({ code: '193847' });
  }
  const coordinationMatch = pathname.match(/^\/api\/orders\/([^/]+)\/pickup-coordination$/);
  if (method === 'GET' && coordinationMatch) {
    return json({
      pickupPoint: { name: "Aisha's Kitchen", address: 'Bangsar, Kuala Lumpur' },
      contact: { name: 'Aisha Rahman', phoneNumber: '+60123456789' },
      sender: { name: 'Aisha Rahman', role: 'buyer' },
    });
  }
  const refundMatch = pathname.match(/^\/api\/orders\/([^/]+)\/refund-request$/);
  if (method === 'GET' && refundMatch) {
    const order = mockDb.rows('orders').find(item => item.id === refundMatch[1]);
    return json({
      request: null,
      policy: {
        directPayment: true,
        windowMinutes: 120,
        deadline: null,
        eligible: order?.status === 'completed',
        photoRequired: false,
      },
    });
  }

  const paymentSettingsMatch = pathname.match(/^\/api\/direct-payments\/settings\/([^/]+)$/);
  if (method === 'GET' && paymentSettingsMatch) {
    const settings = mockDb
      .rows('cook_payment_settings')
      .find(item => item.cook_id === paymentSettingsMatch[1]);
    return json({
      settings: settings ?? null,
      notice: 'You pay the cook directly. Chefin does not hold this payment.',
    });
  }
  const paymentOrderMatch = pathname.match(/^\/api\/direct-payments\/orders\/([^/]+)$/);
  if (method === 'GET' && paymentOrderMatch) {
    const payment = paymentView(paymentOrderMatch[1]);
    if (!payment) return json({ error: 'Payment not found.' }, 404);
    return json({
      payment,
      notice: 'You pay the cook directly. Chefin does not hold this payment.',
    });
  }
  const paymentActionMatch = pathname.match(/^\/api\/direct-payments\/orders\/([^/]+)\/([^/]+)$/);
  if (method === 'POST' && paymentActionMatch) {
    const payment = mockDb
      .rows('direct_payments')
      .find(item => item.order_id === paymentActionMatch[1]);
    const action = paymentActionMatch[2];
    if (payment && action === 'accept') {
      payment.accepted_at = new Date().toISOString();
      payment.deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      payment.state =
        payment.method === 'pay_on_collection' ? 'due_on_collection' : 'awaiting_payment';
      const order = mockDb.rows('orders').find(item => item.id === payment.order_id);
      if (order) order.status = 'confirmed';
    }
    if (payment && action === 'claim') {
      payment.state = 'verification_pending';
      payment.reference = body.reference ?? 'BANK-12345';
    }
    if (payment && action === 'confirm') {
      payment.state = 'confirmed';
      payment.confirmed_at = new Date().toISOString();
      const order = mockDb.rows('orders').find(item => item.id === payment.order_id);
      if (order) order.payment_status = 'paid';
    }
    return json({ success: true, payment: paymentView(paymentActionMatch[1]) });
  }

  if (method === 'GET' && pathname === '/api/cook-menu/option-groups') {
    const result = await mockDb
      .from('menu_option_groups')
      .select(
        'id, name, selection_type, min_select, max_select, is_active, menu_options(id, name, price_delta, is_available, sort_order), listing_option_groups(listing_id, sort_order)'
      )
      .eq('cook_id', DEMO_PROFILE_ID);
    return json({ groups: result.data ?? [] });
  }

  if (method === 'GET' && pathname === '/api/admin/session') {
    return json({
      admin: {
        userId: DEMO_USER_ID,
        email: 'aisha@chefin.app',
        fullName: 'Aisha Rahman',
        profileImage: null,
      },
    });
  }
  if (method === 'GET' && pathname === '/api/admin/overview') {
    return json({
      period: url.searchParams.get('period') ?? '30d',
      generatedAt: new Date().toISOString(),
      summary: {
        totalUsers: mockDb.rows('profiles').length,
        totalCooks: 4,
        totalDishes: mockDb.rows('listings').length,
        totalOrders: mockDb.rows('orders').length,
        recordedOrderValue: 59,
        pendingActions: 1,
      },
      salesSeries: [
        { label: 'Mon', value: 28, orders: 1 },
        { label: 'Tue', value: 13, orders: 1 },
        { label: 'Wed', value: 18, orders: 1 },
      ],
      breakdowns: {
        accounts: { users: 2, cooks: 4 },
        fulfillment: { pickup: 3, delivery: 0 },
        orderStatus: { pending: 1, confirmed: 1, completed: 1 },
        dishStatus: { approved: mockDb.rows('listings').length },
      },
      topCooks: mockDb
        .rows('profiles')
        .filter(profile => profile.restaurant_name)
        .map(profile => ({
          id: profile.id,
          displayId: String(profile.id).slice(0, 8),
          name: profile.restaurant_name,
          ownerName: profile.full_name,
          avatarUrl: profile.profile_image,
          cuisine: 'Malay',
          totalOrders: 2,
          averageRating: 4.8,
          recordedOrderValue: 30,
        })),
      recentOrders: mockDb.rows('orders').map(order => {
        const listing = listingById(String(order.listing_id));
        const cook = listing ? profileById(String(listing.cook_id)) : undefined;
        const customer = profileById(String(order.customer_id));
        return {
          id: order.id,
          displayId: String(order.id).slice(0, 8),
          mealName: listing?.title ?? 'Dish',
          imageUrl: listing?.image_url ?? null,
          customerName: customer?.full_name ?? 'Customer',
          cookName: cook?.restaurant_name ?? 'Cook',
          fulfillmentType: order.fulfillment_type,
          orderValue: Number(order.total_price),
          status: order.status,
          createdAt: order.created_at,
        };
      }),
    });
  }
  if (method === 'GET' && pathname === '/api/admin/activity') {
    return json({
      activity: [
        {
          id: 'activity-new-order',
          type: 'order',
          title: 'New order',
          body: 'Daniel ordered nasi lemak from Aisha.',
          createdAt: new Date().toISOString(),
          unread: true,
          deepLink: {
            pathname: '/admin/orders',
            params: { orderId: '77777777-7777-4777-8777-777777777771' },
          },
        },
      ],
    });
  }
  if (method === 'POST' && pathname === '/api/admin/activity/read') return json({ success: true });
  if (method === 'GET' && pathname === '/api/admin/users') {
    return json({
      users: mockDb.rows('profiles').map(profile => ({
        userId: profile.user_id,
        profileId: profile.id,
        displayId: String(profile.id).slice(0, 8),
        name: profile.full_name,
        email: 'demo@chefin.app',
        phone: profile.phone_number,
        avatarUrl: profile.profile_image,
        roles: profile.restaurant_name ? ['cook'] : ['customer'],
        primaryRole: profile.restaurant_name ? 'Cook' : 'Customer',
        verified: profile.is_verified,
        joinedAt: profile.created_at,
        lastSignInAt: profile.created_at,
        status: 'active',
      })),
      pagination: { page: 1, pageSize: 20, total: mockDb.rows('profiles').length, totalPages: 1 },
    });
  }

  if (method === 'GET' && pathname.startsWith('/api/admin')) {
    return json({
      dishes: [],
      cooks: [],
      orders: [],
      payments: [],
      reports: [],
      refunds: [],
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });
  }
  if (method === 'GET') return json([]);
  return json({ success: true });
};

export const handleMockRequest = async (
  input: string,
  init?: RequestInit
): Promise<MockResponse> => {
  const absolute = /^https?:\/\//.test(input)
    ? input
    : `http://127.0.0.1:8000/${input.replace(/^\/+/, '')}`;
  const url = new URL(absolute);
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  return handle(String(init?.method ?? 'GET').toUpperCase(), pathname, url, readBody(init));
};
