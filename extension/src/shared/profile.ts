import type { ProfileDemographics, ProfileTemplate } from './types.js';

export const DEFAULT_PROFILE_DEMOGRAPHICS: ProfileDemographics = {
  ageRange: 'unspecified',
  region: 'unspecified',
  occupation: 'unspecified'
};

export const DEFAULT_PROFILE_TONE = 'Neutral explanatory tone.';
export const DEFAULT_PROFILE_PREFERENCE = 'Explain concepts with relatable, everyday examples.';

type RawProfileTemplate = Omit<ProfileTemplate, 'demographics' | 'tone' | 'goals' | 'personalPreference'> & {
  demographics?: Partial<ProfileDemographics>;
  tone?: string | null;
  goals?: string | null;
  personalPreference?: string | null;
};

export function normalizeProfileTemplate(profile: RawProfileTemplate): ProfileTemplate {
  const demographics = {
    ...DEFAULT_PROFILE_DEMOGRAPHICS,
    ...(profile.demographics ?? {})
  };
  const tone = profile.tone ?? DEFAULT_PROFILE_TONE;
  const goals = profile.goals ?? undefined;
  const personalPreference = profile.personalPreference?.trim();
  return {
    ...profile,
    demographics,
    tone,
    personalPreference: personalPreference || undefined,
    goals
  };
}
