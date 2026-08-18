export interface RestaurantOpeningHour {
  isoWeekday: number;
  opensAt: string;
  closesAt: string;
  enabled: boolean;
}

export interface RestaurantReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string | null;
  dishTitle: string | null;
  reviewerName: string;
}

export interface RestaurantTopPick {
  id: string;
  title: string;
  price: number;
  image_url: string | null;
  cuisine: string | null;
  orderCount: number;
  avgRating: number | null;
  reviewCount: number;
  badge: string | null;
}

export interface RestaurantProfilePayload {
  profile: {
    id: string;
    full_name: string;
    restaurant_name: string | null;
    profile_image: string | null;
    bio: string | null;
    is_verified: boolean | null;
  };
  areaAddress: string;
  openingHours: RestaurantOpeningHour[];
  achievements: {
    foodSafetyLicense: boolean;
    foodHandlerCertificate: boolean;
    fosimRegistration: boolean;
    typhoidVaccination: boolean;
  };
  cuisines: string[];
  topPicks: RestaurantTopPick[];
  reviews: RestaurantReview[];
  distanceLabel: string | null;
}

const formatClockLabel = (time: string): string => {
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

/**
 * Whether the restaurant is open right now per its weekly hours, with a short
 * human label ("Closes 9:30 PM" / "Opens 11:00 AM" / "Closed today").
 */
export const describeOpenState = (
  openingHours: RestaurantOpeningHour[],
  now = new Date()
): { open: boolean; detail: string } => {
  const isoToday = ((now.getDay() + 6) % 7) + 1; // Mon=1 … Sun=7
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const todays = openingHours
    .filter(window => window.enabled && window.isoWeekday === isoToday)
    .map(window => ({ opens: window.opensAt.slice(0, 5), closes: window.closesAt.slice(0, 5) }))
    .sort((a, b) => (a.opens < b.opens ? -1 : 1));

  for (const window of todays) {
    if (clock >= window.opens && clock < window.closes) {
      return { open: true, detail: `Closes ${formatClockLabel(window.closes)}` };
    }
  }
  const upcoming = todays.find(window => clock < window.opens);
  if (upcoming) return { open: false, detail: `Opens ${formatClockLabel(upcoming.opens)}` };
  return { open: false, detail: openingHours.length ? 'Closed today' : 'Hours unavailable' };
};
