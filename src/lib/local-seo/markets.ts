export type City = { slug: string; name: string; state: string };
export type Industry = { slug: string; name: string; plural: string; category: string };

export const CITIES: City[] = [
  { slug: "austin-tx", name: "Austin", state: "TX" },
  { slug: "dallas-tx", name: "Dallas", state: "TX" },
  { slug: "houston-tx", name: "Houston", state: "TX" },
  { slug: "san-antonio-tx", name: "San Antonio", state: "TX" },
  { slug: "phoenix-az", name: "Phoenix", state: "AZ" },
  { slug: "denver-co", name: "Denver", state: "CO" },
  { slug: "atlanta-ga", name: "Atlanta", state: "GA" },
  { slug: "chicago-il", name: "Chicago", state: "IL" },
  { slug: "miami-fl", name: "Miami", state: "FL" },
  { slug: "tampa-fl", name: "Tampa", state: "FL" },
  { slug: "orlando-fl", name: "Orlando", state: "FL" },
  { slug: "nashville-tn", name: "Nashville", state: "TN" },
  { slug: "las-vegas-nv", name: "Las Vegas", state: "NV" },
  { slug: "seattle-wa", name: "Seattle", state: "WA" },
  { slug: "portland-or", name: "Portland", state: "OR" },
  { slug: "san-diego-ca", name: "San Diego", state: "CA" },
  { slug: "los-angeles-ca", name: "Los Angeles", state: "CA" },
  { slug: "charlotte-nc", name: "Charlotte", state: "NC" },
  { slug: "raleigh-nc", name: "Raleigh", state: "NC" },
  { slug: "columbus-oh", name: "Columbus", state: "OH" },
  { slug: "indianapolis-in", name: "Indianapolis", state: "IN" },
  { slug: "kansas-city-mo", name: "Kansas City", state: "MO" },
  { slug: "salt-lake-city-ut", name: "Salt Lake City", state: "UT" },
  { slug: "minneapolis-mn", name: "Minneapolis", state: "MN" },
  { slug: "st-louis-mo", name: "St. Louis", state: "MO" },
  { slug: "pittsburgh-pa", name: "Pittsburgh", state: "PA" },
  { slug: "richmond-va", name: "Richmond", state: "VA" },
  { slug: "louisville-ky", name: "Louisville", state: "KY" },
  { slug: "oklahoma-city-ok", name: "Oklahoma City", state: "OK" },
  { slug: "albuquerque-nm", name: "Albuquerque", state: "NM" },
];

export const INDUSTRIES: Industry[] = [
  { slug: "plumber", name: "Plumber", plural: "Plumbers", category: "home services" },
  { slug: "dentist", name: "Dentist", plural: "Dentists", category: "healthcare" },
  { slug: "restaurant", name: "Restaurant", plural: "Restaurants", category: "food & beverage" },
  { slug: "gym", name: "Gym", plural: "Gyms", category: "fitness" },
  { slug: "salon", name: "Salon", plural: "Salons", category: "beauty" },
  { slug: "med-spa", name: "Med Spa", plural: "Med Spas", category: "beauty & wellness" },
  { slug: "attorney", name: "Attorney", plural: "Attorneys", category: "legal" },
  { slug: "hvac", name: "HVAC Company", plural: "HVAC Companies", category: "home services" },
  { slug: "auto-repair", name: "Auto Repair Shop", plural: "Auto Repair Shops", category: "automotive" },
  { slug: "chiropractor", name: "Chiropractor", plural: "Chiropractors", category: "healthcare" },
  { slug: "electrician", name: "Electrician", plural: "Electricians", category: "home services" },
  { slug: "landscaping", name: "Landscaping Company", plural: "Landscaping Companies", category: "home services" },
  { slug: "roofing", name: "Roofing Company", plural: "Roofing Companies", category: "home services" },
  { slug: "cleaning-service", name: "Cleaning Service", plural: "Cleaning Services", category: "home services" },
  { slug: "pet-grooming", name: "Pet Groomer", plural: "Pet Groomers", category: "pet services" },
  { slug: "yoga-studio", name: "Yoga Studio", plural: "Yoga Studios", category: "fitness" },
  { slug: "physical-therapist", name: "Physical Therapist", plural: "Physical Therapists", category: "healthcare" },
  { slug: "accountant", name: "Accountant", plural: "Accountants", category: "professional services" },
  { slug: "real-estate-agent", name: "Real Estate Agent", plural: "Real Estate Agents", category: "real estate" },
  { slug: "veterinarian", name: "Veterinarian", plural: "Veterinarians", category: "pet services" },
  { slug: "urgent-care", name: "Urgent Care", plural: "Urgent Care Clinics", category: "healthcare" },
  { slug: "apartment-complex", name: "Apartment Complex", plural: "Apartment Communities", category: "real estate" },
  { slug: "personal-trainer", name: "Personal Trainer", plural: "Personal Trainers", category: "fitness" },
  { slug: "tattoo-shop", name: "Tattoo Shop", plural: "Tattoo Shops", category: "beauty" },
  { slug: "brewery", name: "Brewery", plural: "Breweries", category: "food & beverage" },
];

export function findCity(slug: string): City | undefined {
  return CITIES.find((c) => c.slug === slug);
}

export function findIndustry(slug: string): Industry | undefined {
  return INDUSTRIES.find((i) => i.slug === slug);
}

/** The subset we pre-render at build time — top 10 cities × all industries. */
export function getStaticCombos(): Array<{ city: string; industry: string }> {
  const topCities = CITIES.slice(0, 10).map((c) => c.slug);
  return topCities.flatMap((city) => INDUSTRIES.map((i) => ({ city, industry: i.slug })));
}
