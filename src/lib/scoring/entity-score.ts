export type EntityScoreResult = {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: { label: string; points: number; earned: boolean }[];
  topRecommendation: string;
};

import { getGrade } from "./aeo-score";
export { getGrade };

export function computeEntityScore(input: {
  citationMismatches: number;
  citationTotal: number;
  socialProfilesFound: number;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  aiMentionRate: number; // 0-1
}): EntityScoreResult {
  const {
    citationMismatches,
    citationTotal,
    socialProfilesFound,
    hasWebsite,
    hasPhone,
    hasAddress,
    aiMentionRate,
  } = input;

  // Social: 15 for >=2, 8 for >=1 (not stacked)
  const hasSocial1 = socialProfilesFound >= 1;
  const hasSocial2 = socialProfilesFound >= 2;

  // Citations: 15 for >=5, 8 for >=1 (not stacked)
  const hasCitation1 = citationTotal >= 1;
  const hasCitation5 = citationTotal >= 5;

  // Mismatch credit: 20 for 0 mismatches (when there are citations), 10 for <=2
  const hasNoCitationMismatches = citationTotal > 0 && citationMismatches === 0;
  const hasFewCitationMismatches = citationTotal > 0 && citationMismatches > 0 && citationMismatches <= 2;

  const hasAiPresence = aiMentionRate >= 0.3;

  const factors: { label: string; points: number; earned: boolean }[] = [
    { label: "Website present", points: 15, earned: hasWebsite },
    { label: "Phone number on file", points: 10, earned: hasPhone },
    { label: "Business address on file", points: 10, earned: hasAddress },
    // Social tiers (pick highest)
    { label: "2+ social profiles found", points: 15, earned: hasSocial2 },
    { label: "1 social profile found", points: 8, earned: hasSocial1 && !hasSocial2 },
    // Citation tiers (pick highest)
    { label: "5+ citations tracked", points: 15, earned: hasCitation5 },
    { label: "At least 1 citation tracked", points: 8, earned: hasCitation1 && !hasCitation5 },
    // Mismatch tiers (pick highest)
    { label: "No citation mismatches", points: 20, earned: hasNoCitationMismatches },
    { label: "2 or fewer citation mismatches", points: 10, earned: hasFewCitationMismatches },
    { label: "AI mention rate 30%+", points: 15, earned: hasAiPresence },
  ];

  let score = 0;
  for (const f of factors) {
    if (f.earned) score += f.points;
  }
  score = Math.min(100, Math.max(0, score));

  let topRecommendation: string;
  if (!hasWebsite) {
    topRecommendation = "Add a website to your business profile so your entity is anchored across the web.";
  } else if (!hasPhone) {
    topRecommendation = "Add a phone number so citation directories and AI assistants can verify your business identity.";
  } else if (!hasAddress) {
    topRecommendation = "Add your business address so your NAP (Name, Address, Phone) data is complete and consistent.";
  } else if (hasCitation5 && citationMismatches > 2) {
    topRecommendation = "Fix your citation mismatches — inconsistent NAP data confuses AI assistants and hurts local rankings.";
  } else if (!hasCitation5) {
    topRecommendation = "Get listed in more directories to build a strong citation footprint that AI assistants can verify.";
  } else if (!hasSocial2) {
    topRecommendation = "Add social profiles to reinforce your entity signals across the web and help AI assistants confirm your business.";
  } else {
    topRecommendation = "Your entity consistency is strong. Keep citations accurate and social profiles active to maintain your score.";
  }

  return {
    score,
    grade: getGrade(score),
    factors,
    topRecommendation,
  };
}
