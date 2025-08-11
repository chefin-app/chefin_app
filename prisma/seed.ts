// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

// Helper functions
const getRandomItem = <T>(array: T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const addDays = (days: number): Date => {
  const result = new Date();
  result.setDate(result.getDate() + days);
  return result;
};

// Predefined data for food-related content
const cuisines = [
  'Italian',
  'Thai',
  'Korean',
  'Mexican',
  'Chinese',
  'Japanese',
  'Indian',
  'Malaysian',
  'Vietnamese',
  'Mediterranean',
  'French',
  'American',
  'Indonesian',
  'Healthy',
];

const dietaryTags = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'gluten',
  'dairy-free',
  'nut-free',
  'spicy',
  'halal',
  'kosher',
  'low-carb',
  'keto',
  'organic',
  'shellfish',
  'fish',
  'coconut',
  'soy-free',
];

const klangValleyAreas = [
  'Klang Valley Area',
  'PJ SS15 Area',
  'Mont Kiara Area',
  'Damansara Heights',
  'Bangsar Area',
  'Subang Jaya',
  'Shah Alam',
  'Petaling Jaya',
  'TTDI',
  'Ampang',
  'Cheras',
  'Wangsa Maju',
  'Setapak',
  'Kepong',
  'Sri Petaling',
  'Puchong',
];

const foodImages = [
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400',
  'https://images.unsplash.com/photo-1559314809-0f31657499fe?w=400',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400',
  'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400',
  'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=400',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400',
  'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400',
];

const orderStatuses = ['pending', 'confirmed', 'ready', 'completed', 'cancelled'];
const paymentStatuses = ['paid', 'unpaid', 'refunded'];

// Generate food names and descriptions
const generateFoodListing = () => {
  const cuisine = getRandomItem(cuisines);
  const foodTypes = {
    Italian: [
      'Pizza',
      'Pasta',
      'Risotto',
      'Lasagna',
      'Gnocchi',
      'Ravioli',
      'Carbonara',
      'Bolognese',
    ],
    Thai: [
      'Pad Thai',
      'Tom Yum',
      'Green Curry',
      'Massaman',
      'Som Tam',
      'Pad Krapow',
      'Mango Sticky Rice',
    ],
    Korean: [
      'Kimchi Fried Rice',
      'Bulgogi',
      'Bibimbap',
      'Korean BBQ',
      'Japchae',
      'Tteokbokki',
      'Galbi',
    ],
    Mexican: ['Tacos', 'Enchiladas', 'Quesadillas', 'Burritos', 'Nachos', 'Guacamole', 'Elote'],
    Chinese: [
      'Fried Rice',
      'Kung Pao',
      'Sweet and Sour',
      'Dumplings',
      'Noodles',
      'Dim Sum',
      'Hot Pot',
    ],
    Japanese: ['Sushi', 'Ramen', 'Tempura', 'Teriyaki', 'Bento', 'Miso Soup', 'Udon'],
    Indian: ['Butter Chicken', 'Biryani', 'Curry', 'Naan', 'Samosa', 'Tandoori', 'Dal'],
    Malaysian: [
      'Nasi Lemak',
      'Rendang',
      'Laksa',
      'Char Kway Teow',
      'Satay',
      'Roti Canai',
      'Mee Goreng',
    ],
    Healthy: [
      'Buddha Bowl',
      'Quinoa Salad',
      'Smoothie Bowl',
      'Protein Bowl',
      'Veggie Wrap',
      'Green Salad',
    ],
  };

  const dishTypes = foodTypes[cuisine as keyof typeof foodTypes] || ['Special Dish'];
  const dishName = getRandomItem(dishTypes);

  const adjective = faker.helpers.arrayElement([
    'Authentic',
    'Homemade',
    'Traditional',
    'Spicy',
    'Fresh',
    'Delicious',
    'Classic',
    'Premium',
    'Signature',
    'Special',
  ]);

  return {
    title: `${adjective} ${dishName}`,
    description: `${faker.lorem.sentence()} ${faker.lorem.sentence()}`,
    cuisine: cuisine,
    price: parseFloat(faker.commerce.price({ min: 10, max: 80 })),
    image_url: getRandomItem(foodImages),
    dietary_tags: faker.helpers.arrayElements(dietaryTags, { min: 1, max: 4 }),
    pickup_location: getRandomItem(klangValleyAreas),
    is_certified: faker.datatype.boolean({ probability: 0.8 }),
  };
};

async function main() {
  console.log('Starting database seeding with Faker...');

  // Clear existing data (optional - uncomment if needed)
  console.log('Clearing existing data...');
  await prisma.reviews.deleteMany();
  await prisma.orders.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.listings.deleteMany();
  await prisma.user_roles.deleteMany();
  await prisma.profiles.deleteMany();

  // Seed auth.users first
  const numberOfUsers = 20;
  const seededUsers: { id: string; email: string; fullName: string }[] = [];

  console.log(`Seeding ${numberOfUsers} auth.users...`);
  for (let i = 0; i < numberOfUsers; i++) {
    const id = faker.string.uuid();
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.email({ firstName, lastName }).toLowerCase();
    const fullName = `${firstName} ${lastName}`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1::uuid, $2, $3::jsonb)`,
      id,
      email,
      JSON.stringify({ full_name: fullName })
    );

    seededUsers.push({ id, email, fullName });
  }
  console.log(`Seeded ${seededUsers.length} auth.users`);

  // Create profiles with realistic data
  const createdProfiles = [];

  console.log(`Creating ${numberOfUsers} user profiles...`);
  for (let i = 0; i < numberOfUsers; i++) {
    const user = seededUsers[i];
    const isCook = faker.datatype.boolean({ probability: 0.4 });

    const profile = await prisma.profiles.create({
      data: {
        user_id: user.id,
        full_name: user.fullName,
        profile_image: faker.image.avatar(),
        phone_number: `+601${faker.string.numeric({ length: 8 })}`, // Malaysian phone format
        bio: isCook
          ? `${faker.lorem.sentence()} Specializing in ${getRandomItem(cuisines).toLowerCase()} cuisine. ${faker.lorem.sentence()}`
          : faker.lorem.sentence(),
        is_verified: isCook ? faker.datatype.boolean({ probability: 0.8 }) : false,
      },
    });

    // Assign roles
    const roles = isCook ? ['cook', 'guest'] : ['guest'];
    for (const role of roles) {
      await prisma.user_roles.upsert({
        where: {
          user_id_role: { user_id: profile.user_id, role: role },
        },
        update: {},
        create: { user_id: profile.user_id, role: role },
      });
    }

    createdProfiles.push({ ...profile, roles, isCook });
  }
  console.log(`Created ${createdProfiles.length} profiles`);

  // Create listings for cooks
  const cooks = createdProfiles.filter(p => p.isCook);
  const createdListings = [];

  console.log(`Creating listings for ${cooks.length} cooks...`);
  for (const cook of cooks) {
    // Each cook gets 1-4 listings
    const numListings = getRandomInt(1, 4);

    for (let i = 0; i < numListings; i++) {
      const foodData = generateFoodListing();

      const listing = await prisma.listings.create({
        data: {
          cook_id: cook.id,
          title: foodData.title,
          description: foodData.description,
          price: foodData.price,
          image_url: foodData.image_url,
          cuisine: foodData.cuisine,
          dietary_tags: foodData.dietary_tags,
          pickup_location: foodData.pickup_location,
          is_certified: foodData.is_certified,
          is_active: faker.datatype.boolean({ probability: 0.9 }),
        },
      });
      createdListings.push(listing);
    }
  }
  console.log(`Created ${createdListings.length} listings`);

  // Create availability slots
  const timeSlots = [
    { start: '10:00:00', end: '12:00:00' }, // Morning
    { start: '11:30:00', end: '14:00:00' }, // Lunch
    { start: '17:00:00', end: '19:30:00' }, // Dinner
    { start: '18:30:00', end: '21:00:00' }, // Late dinner
  ];

  const createdAvailabilities = [];
  console.log('Creating availability slots...');

  for (const listing of createdListings) {
    // Create availability for next 21 days
    for (let day = 1; day <= 21; day++) {
      // Each listing has 60% chance of being available on any given day
      if (faker.datatype.boolean({ probability: 0.6 })) {
        // Cooks can choose multiple time slots per day
        // Some prefer lunch only, some dinner only, some both
        const availabilityPattern = faker.helpers.weightedArrayElement([
          { weight: 0.3, value: [0] }, // Morning only
          { weight: 0.25, value: [1] }, // Lunch only
          { weight: 0.25, value: [2] }, // Dinner only
          { weight: 0.1, value: [3] }, // Late dinner only
          { weight: 0.15, value: [1, 2] }, // Lunch + Dinner
          { weight: 0.1, value: [0, 1] }, // Morning + Lunch
          { weight: 0.05, value: [2, 3] }, // Dinner + Late dinner
          { weight: 0.05, value: [1, 2, 3] }, // Multiple slots
        ]);

        for (const slotIndex of availabilityPattern) {
          const timeSlot = timeSlots[slotIndex];
          const maxOrders = getRandomInt(1, 8);
          const ordersTaken = getRandomInt(0, Math.min(maxOrders, 3));
          const availableDate = addDays(day);
          // build Date objects for start_time and end_time so Prisma DateTime fields accept them
          const [sh, sm, ss] = timeSlot.start.split(':').map(s => Number(s));
          const [eh, em, es] = timeSlot.end.split(':').map(s => Number(s));
          const startDateTime = new Date(availableDate);
          startDateTime.setHours(sh || 0, sm || 0, ss || 0, 0);
          const endDateTime = new Date(availableDate);
          endDateTime.setHours(eh || 0, em || 0, es || 0, 0);

          const availability = await prisma.availability.create({
            data: {
              listing_id: listing.id,
              available_date: availableDate,
              start_time: startDateTime,
              end_time: endDateTime,
              max_orders: maxOrders,
              orders_taken: ordersTaken,
            },
          });
          createdAvailabilities.push(availability);
        }
      }
    }
  }
  console.log(`Created ${createdAvailabilities.length} availability slots`);

  // Create orders
  const customers = createdProfiles;
  const numberOfOrders = Math.min(100, Math.floor(createdAvailabilities.length * 0.3));
  const createdOrders = [];

  console.log(`Creating ${numberOfOrders} orders...`);
  for (let i = 0; i < numberOfOrders; i++) {
    const availability = getRandomItem(createdAvailabilities);
    const listing = createdListings.find(l => l.id === availability.listing_id);
    const customer = getRandomItem(customers.filter(c => c.id !== listing?.cook_id));

    if (listing && customer) {
      const quantity = getRandomInt(1, 4);
      const totalPrice = listing.price * quantity;
      const status = faker.helpers.weightedArrayElement([
        { weight: 0.1, value: 'pending' },
        { weight: 0.2, value: 'confirmed' },
        { weight: 0.15, value: 'ready' },
        { weight: 0.45, value: 'completed' },
        { weight: 0.1, value: 'cancelled' },
      ]);

      const paymentStatus = faker.helpers.weightedArrayElement([
        { weight: 0.8, value: 'paid' },
        { weight: 0.15, value: 'unpaid' },
        { weight: 0.05, value: 'refunded' },
      ]);

      const createdAt = faker.date.between({
        from: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        to: new Date(),
      });

      const order = await prisma.orders.create({
        data: {
          customer_id: customer.id,
          listing_id: listing.id,
          quantity: quantity,
          total_price: totalPrice,
          scheduled_date: availability.available_date,
          pickup_time: availability.start_time,
          status: status,
          payment_status: paymentStatus,
          created_at: createdAt,
        },
      });
      createdOrders.push(order);
    }
  }
  console.log(`Created ${createdOrders.length} orders`);

  // Create reviews for completed orders
  const completedOrders = createdOrders.filter(o => o.status === 'completed');
  const createdReviews = [];

  console.log('Creating reviews...');
  for (const order of completedOrders) {
    // 70% chance of getting a review
    if (faker.datatype.boolean({ probability: 0.7 })) {
      const rating = faker.helpers.weightedArrayElement([
        { weight: 0.05, value: 1 },
        { weight: 0.05, value: 2 },
        { weight: 0.15, value: 3 },
        { weight: 0.35, value: 4 },
        { weight: 0.4, value: 5 },
      ]);

      // Generate contextual review based on rating
      let comment = '';
      if (rating >= 4) {
        comment = faker.helpers.arrayElement([
          'Amazing food! Will definitely order again.',
          'Delicious and authentic taste. Highly recommended!',
          'Great portion size and flavor. Worth every penny.',
          'Excellent home-cooked meal. The cook is very talented.',
          'Perfect for a family dinner. Everyone loved it!',
          'Outstanding quality and taste. Exceeded expectations!',
          'Fresh ingredients and perfectly seasoned. 5 stars!',
        ]);
      } else if (rating === 3) {
        comment = faker.helpers.arrayElement([
          'Good food but could use more seasoning.',
          'Decent meal, but portion was smaller than expected.',
          'Average taste, nothing special but not bad.',
          'Food was okay, delivery was a bit late.',
          "Not bad, but I've had better from other cooks.",
        ]);
      } else {
        comment = faker.helpers.arrayElement([
          'Food was cold when I picked it up.',
          'Not worth the price. Quality was disappointing.',
          'Had to wait longer than expected.',
          "Food didn't match the description.",
          "Won't order again. Poor quality.",
        ]);
      }

      const reviewDate = new Date(order.created_at);
      reviewDate.setDate(reviewDate.getDate() + getRandomInt(1, 7)); // Review 1-7 days after order

      const review = await prisma.reviews.create({
        data: {
          customer_id: order.customer_id,
          listing_id: order.listing_id,
          rating: rating,
          comment: comment,
          created_at: reviewDate,
        },
      });
      createdReviews.push(review);
    }
  }
  console.log(`Created ${createdReviews.length} reviews`);

  // Display summary with statistics
  const totalCooks = cooks.length;
  const totalCustomers = createdProfiles.length - totalCooks;
  const averagePrice =
    createdListings.reduce((sum, l) => sum + Number(l.price), 0) / createdListings.length;
  const averageRating =
    createdReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / createdReviews.length;

  console.log('\n=== Seeding Summary ===');
  console.log(`Total Profiles: ${createdProfiles.length}`);
  console.log(`Cooks: ${totalCooks}`);
  console.log(`Customers: ${totalCustomers}`);
  console.log(`Listings: ${createdListings.length}`);
  console.log(`Availability slots: ${createdAvailabilities.length}`);
  console.log(`Orders: ${createdOrders.length}`);
  console.log(`Reviews: ${createdReviews.length}`);
  console.log(`Average meal price: RM ${averagePrice.toFixed(2)}`);
  console.log(`Average rating: ${averageRating.toFixed(1)}/5`);
  console.log('Seeding completed successfully!');
}

main()
  .catch(e => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
