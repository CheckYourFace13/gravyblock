/**
 * Schema Markup Generator
 *
 * Pure TypeScript module — no "use client" or "use server".
 * Generates JSON-LD structured data from business profile data.
 */

/** Map GravyBlock vertical to schema.org LocalBusiness subtype */
function getSchemaType(vertical: string | null | undefined): string {
  if (!vertical) return "LocalBusiness";
  const v = vertical.toLowerCase();
  if (v === "restaurant") return "Restaurant";
  if (v === "bar" || v === "brewery") return "BarOrPub";
  if (v === "healthcare") return "MedicalBusiness";
  if (v === "dental") return "Dentist";
  if (v === "legal") return "LegalService";
  if (v === "salon" || v.includes("hair") || v.includes("beauty")) return "HairSalon";
  if (v === "auto" || v.includes("auto")) return "AutoRepair";
  if (v.includes("plumb")) return "Plumber";
  if (v.includes("electric")) return "Electrician";
  if (v === "contractor" || v === "home_services") return "GeneralContractor";
  if (v === "retail") return "Store";
  return "LocalBusiness";
}

type BusinessInput = {
  name: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  primaryCategory?: string | null;
  vertical?: string | null;
  rating?: string | null;
  reviewCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUri?: string | null;
};

/** Generate the main LocalBusiness JSON-LD schema */
export function generateLocalBusinessSchema(business: BusinessInput): object {
  const schemaType = getSchemaType(business.vertical ?? business.primaryCategory);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    "name": business.name,
  };

  if (business.address) {
    schema["address"] = {
      "@type": "PostalAddress",
      "streetAddress": business.address,
    };
  }

  if (business.phone) {
    schema["telephone"] = business.phone;
  }

  if (business.website) {
    schema["url"] = business.website;
  }

  if (business.latitude != null && business.longitude != null) {
    schema["geo"] = {
      "@type": "GeoCoordinates",
      "latitude": business.latitude,
      "longitude": business.longitude,
    };
  }

  if (business.rating && business.reviewCount != null) {
    schema["aggregateRating"] = {
      "@type": "AggregateRating",
      "ratingValue": business.rating,
      "reviewCount": String(business.reviewCount),
    };
  }

  const sameAs: string[] = [];
  if (business.googleMapsUri) sameAs.push(business.googleMapsUri);
  if (sameAs.length > 0) {
    schema["sameAs"] = sameAs;
  }

  return schema;
}

type FaqBusiness = {
  name: string;
  vertical?: string | null;
  primaryCategory?: string | null;
  address?: string | null;
};

type FaqEntry = { question: string; answer: string };

const verticalFaqs: Record<string, (name: string) => FaqEntry[]> = {
  restaurant: (name) => [
    { question: `What type of food does ${name} serve?`, answer: `${name} serves fresh, high-quality dishes made from locally sourced ingredients. Please visit our website or call us for our current menu.` },
    { question: `Does ${name} take reservations?`, answer: `Yes, ${name} accepts reservations. You can book online through our website or call us directly.` },
    { question: `What are ${name}'s hours?`, answer: `Our hours vary by day. Please check our Google listing or website for the most up-to-date hours.` },
    { question: `Does ${name} offer takeout or delivery?`, answer: `Yes, ${name} offers takeout. Please call us or check our website to see if delivery is available in your area.` },
    { question: `Does ${name} have vegetarian or gluten-free options?`, answer: `${name} offers a variety of dietary-friendly options. Ask your server or check our menu online for details.` },
  ],
  bar: (name) => [
    { question: `What kind of drinks does ${name} serve?`, answer: `${name} offers a wide selection of craft beers, cocktails, wines, and non-alcoholic options.` },
    { question: `Does ${name} have a happy hour?`, answer: `Yes, ${name} typically offers happy hour specials. Visit our website or call for current happy hour times and deals.` },
    { question: `Does ${name} allow reservations?`, answer: `${name} accepts reservations for larger groups. Contact us to check availability.` },
    { question: `Is there a cover charge at ${name}?`, answer: `Cover charges may apply on select nights with live entertainment. Check our events calendar or call ahead.` },
    { question: `What are ${name}'s hours?`, answer: `Our hours vary. Check our Google listing or website for the most current information.` },
  ],
  brewery: (name) => [
    { question: `What beers does ${name} brew?`, answer: `${name} brews a rotating selection of craft beers including IPAs, stouts, lagers, and seasonal specialties.` },
    { question: `Can I do a tasting flight at ${name}?`, answer: `Yes, ${name} offers tasting flights so you can sample our full lineup of brews.` },
    { question: `Does ${name} offer brewery tours?`, answer: `${name} may offer tours — please visit our website or call ahead to schedule.` },
    { question: `Can I buy cans or growlers to go at ${name}?`, answer: `Yes, ${name} sells packaged beer and growler fills to go. Ask our taproom staff for available options.` },
    { question: `Does ${name} serve food?`, answer: `${name} may offer food or food truck partnerships. Check our website for current food offerings.` },
  ],
  healthcare: (name) => [
    { question: `What services does ${name} provide?`, answer: `${name} provides a range of healthcare services. Please visit our website or call to learn about available treatments.` },
    { question: `Does ${name} accept insurance?`, answer: `${name} works with many major insurance plans. Contact us to confirm your coverage before your visit.` },
    { question: `How do I schedule an appointment at ${name}?`, answer: `You can schedule an appointment at ${name} by calling our office or using our online booking system.` },
    { question: `Is ${name} accepting new patients?`, answer: `${name} is currently accepting new patients. Contact us to set up your first appointment.` },
    { question: `What should I bring to my first visit at ${name}?`, answer: `Please bring a valid photo ID, your insurance card, and any relevant medical records to your first visit at ${name}.` },
  ],
  dental: (name) => [
    { question: `What dental services does ${name} offer?`, answer: `${name} offers a full range of dental services including cleanings, fillings, crowns, whitening, and more.` },
    { question: `Does ${name} accept dental insurance?`, answer: `${name} accepts most major dental insurance plans. Call our office to verify your coverage.` },
    { question: `How do I schedule a cleaning at ${name}?`, answer: `Call ${name} or book online through our website to schedule a cleaning or any dental procedure.` },
    { question: `Does ${name} offer emergency dental care?`, answer: `${name} offers emergency dental appointments. Call us immediately if you are experiencing dental pain or an emergency.` },
    { question: `Does ${name} offer teeth whitening?`, answer: `Yes, ${name} offers professional in-office and take-home teeth whitening treatments. Ask about current promotions.` },
  ],
  legal: (name) => [
    { question: `What practice areas does ${name} specialize in?`, answer: `${name} handles a range of legal matters. Please visit our website or call to discuss your specific legal needs.` },
    { question: `Does ${name} offer free consultations?`, answer: `${name} may offer a free initial consultation. Contact us to find out more about our intake process.` },
    { question: `How do I get started with ${name}?`, answer: `Contact ${name} by phone or through our website to schedule a consultation and discuss your case.` },
    { question: `What should I bring to my first meeting with ${name}?`, answer: `Bring any relevant documents, contracts, correspondence, or records related to your matter when you meet with ${name}.` },
    { question: `How does ${name} charge for services?`, answer: `${name} offers various fee arrangements depending on the case type. We will clearly explain our fees at your first meeting.` },
  ],
  salon: (name) => [
    { question: `What services does ${name} offer?`, answer: `${name} offers a full range of salon services including haircuts, coloring, styling, and more.` },
    { question: `Do I need an appointment at ${name}?`, answer: `Appointments are recommended at ${name}, though we may accept walk-ins based on availability.` },
    { question: `What hair color services does ${name} provide?`, answer: `${name} offers highlights, balayage, full color, toning, and more. Consult with our stylists for the best option for your hair.` },
    { question: `How long does a visit at ${name} typically take?`, answer: `Appointment length at ${name} varies by service. A simple cut may take 30–45 minutes while color services can take 2+ hours.` },
    { question: `Does ${name} carry professional hair care products?`, answer: `Yes, ${name} carries and recommends professional salon-grade products for maintaining your look at home.` },
  ],
  home_services: (name) => [
    { question: `What areas does ${name} serve?`, answer: `${name} serves the local area and surrounding communities. Contact us to confirm service availability in your location.` },
    { question: `Is ${name} licensed and insured?`, answer: `Yes, ${name} is fully licensed and insured for your peace of mind.` },
    { question: `How quickly can ${name} respond to a service call?`, answer: `${name} aims to respond promptly. Contact us for current availability and scheduling.` },
    { question: `Does ${name} offer free estimates?`, answer: `${name} typically provides free estimates. Call or contact us online to schedule yours.` },
    { question: `What brands or materials does ${name} work with?`, answer: `${name} works with a variety of trusted brands and materials. We will discuss the best options for your project during your estimate.` },
  ],
  contractor: (name) => [
    { question: `What types of projects does ${name} handle?`, answer: `${name} handles a wide range of contracting projects. Contact us to discuss your specific needs and get an estimate.` },
    { question: `Is ${name} licensed and insured?`, answer: `Yes, ${name} is fully licensed and insured for all contracting work.` },
    { question: `How long does a project with ${name} typically take?`, answer: `Project timelines vary depending on scope. ${name} will provide a detailed timeline during your estimate.` },
    { question: `Does ${name} offer free estimates?`, answer: `Yes, ${name} offers free project estimates. Contact us to schedule yours.` },
    { question: `Does ${name} pull permits for construction work?`, answer: `${name} handles all necessary permits for permitted work, ensuring your project meets local code requirements.` },
  ],
  plumber: (name) => [
    { question: `Does ${name} offer emergency plumbing services?`, answer: `Yes, ${name} offers emergency plumbing services. Call us any time for urgent plumbing issues.` },
    { question: `What plumbing services does ${name} provide?`, answer: `${name} handles drain cleaning, pipe repair, water heater installation, leak detection, and much more.` },
    { question: `Is ${name} licensed and insured?`, answer: `Yes, ${name} is a fully licensed and insured plumbing company.` },
    { question: `How quickly can ${name} come out for a repair?`, answer: `${name} strives to offer same-day and next-day service. Call us to check current availability.` },
    { question: `Does ${name} offer free plumbing estimates?`, answer: `${name} provides upfront pricing and free estimates on most plumbing work. Contact us for details.` },
  ],
  electrician: (name) => [
    { question: `What electrical services does ${name} provide?`, answer: `${name} offers a full range of electrical services including panel upgrades, outlet installation, rewiring, and EV charger installation.` },
    { question: `Is ${name} a licensed electrician?`, answer: `Yes, ${name} is fully licensed and insured to perform electrical work in compliance with local codes.` },
    { question: `Does ${name} handle residential and commercial work?`, answer: `${name} serves both residential and commercial clients. Contact us to discuss your project.` },
    { question: `How do I schedule an appointment with ${name}?`, answer: `Call or contact ${name} online to schedule an electrical inspection or service appointment.` },
    { question: `Does ${name} offer electrical inspections?`, answer: `Yes, ${name} can perform electrical safety inspections. This is especially recommended for older homes or before purchasing property.` },
  ],
  retail: (name) => [
    { question: `What products does ${name} sell?`, answer: `${name} carries a carefully curated selection of products. Visit us in-store or browse our website to see our full inventory.` },
    { question: `Does ${name} offer online shopping?`, answer: `${name} may offer online ordering or local delivery. Check our website for current shopping options.` },
    { question: `What are ${name}'s return and exchange policies?`, answer: `${name} has a customer-friendly return policy. Ask in store or review our policy on our website.` },
    { question: `Does ${name} offer gift wrapping?`, answer: `${name} may offer gift wrapping services, especially during the holiday season. Ask a team member for details.` },
    { question: `Does ${name} have a loyalty program?`, answer: `${name} may offer a loyalty or rewards program for regular customers. Ask in store for details.` },
  ],
  auto: (name) => [
    { question: `What auto repair services does ${name} offer?`, answer: `${name} handles oil changes, brake repair, tire service, engine diagnostics, and more.` },
    { question: `Does ${name} work on all vehicle makes and models?`, answer: `${name} services most domestic and foreign vehicle makes and models. Call ahead if you have a specialty vehicle.` },
    { question: `How long will repairs take at ${name}?`, answer: `Repair time depends on the service needed. ${name} will provide an estimate when you drop off your vehicle.` },
    { question: `Does ${name} offer loaner cars or shuttle service?`, answer: `Contact ${name} to ask about loaner vehicles or shuttle service while your car is being serviced.` },
    { question: `Is ${name} certified to work on my vehicle?`, answer: `${name} employs trained and certified technicians. Ask us about our certifications and experience.` },
  ],
  default: (name) => [
    { question: `What services does ${name} provide?`, answer: `${name} provides professional services tailored to our clients' needs. Visit our website or call us to learn more.` },
    { question: `Where is ${name} located?`, answer: `${name} is conveniently located to serve you. Check our Google listing or website for our full address and hours.` },
    { question: `How can I contact ${name}?`, answer: `You can reach ${name} by phone or through our website contact form. We aim to respond quickly.` },
    { question: `Does ${name} offer free consultations?`, answer: `${name} may offer a free initial consultation. Contact us to find out how to get started.` },
    { question: `What sets ${name} apart from competitors?`, answer: `${name} is committed to quality, reliability, and exceptional customer service. We'd love to show you the difference.` },
  ],
};

/** Generate FAQPage JSON-LD schema with 5 common Q&As based on vertical */
export function generateFAQSchema(business: FaqBusiness): object {
  const v = (business.vertical ?? business.primaryCategory ?? "").toLowerCase();

  let faqs: FaqEntry[] = [];
  if (verticalFaqs[v]) {
    faqs = verticalFaqs[v](business.name);
  } else if (v.includes("bar") || v.includes("pub")) {
    faqs = verticalFaqs.bar(business.name);
  } else if (v.includes("brew")) {
    faqs = verticalFaqs.brewery(business.name);
  } else if (v.includes("dental") || v.includes("dentist")) {
    faqs = verticalFaqs.dental(business.name);
  } else if (v.includes("health") || v.includes("medical") || v.includes("clinic")) {
    faqs = verticalFaqs.healthcare(business.name);
  } else if (v.includes("legal") || v.includes("attorney") || v.includes("lawyer")) {
    faqs = verticalFaqs.legal(business.name);
  } else if (v.includes("salon") || v.includes("hair") || v.includes("beauty")) {
    faqs = verticalFaqs.salon(business.name);
  } else if (v.includes("plumb")) {
    faqs = verticalFaqs.plumber(business.name);
  } else if (v.includes("electric")) {
    faqs = verticalFaqs.electrician(business.name);
  } else if (v.includes("contract") || v.includes("home_service") || v.includes("hvac") || v.includes("roofing")) {
    faqs = verticalFaqs.home_services(business.name);
  } else if (v.includes("auto") || v.includes("mechanic") || v.includes("car")) {
    faqs = verticalFaqs.auto(business.name);
  } else if (v.includes("retail") || v.includes("shop") || v.includes("store")) {
    faqs = verticalFaqs.retail(business.name);
  } else {
    faqs = verticalFaqs.default(business.name);
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  };
}

type ServiceBusiness = {
  name: string;
  website?: string | null;
  primaryCategory?: string | null;
  vertical?: string | null;
};

/** Generate a simple Service JSON-LD schema */
export function generateServiceSchema(business: ServiceBusiness): object {
  const serviceName =
    business.primaryCategory
      ? `${business.primaryCategory} Services`
      : business.vertical
        ? `${business.vertical.replace(/_/g, " ")} Services`
        : "Local Business Services";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": serviceName,
    "provider": {
      "@type": "LocalBusiness",
      "name": business.name,
      ...(business.website ? { "url": business.website } : {}),
    },
    "areaServed": {
      "@type": "City",
    },
  };

  if (business.website) {
    schema["url"] = business.website;
  }

  return schema;
}
