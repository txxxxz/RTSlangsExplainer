import type { ProfileDemographics, ProfileTemplate } from './types';

export const DEFAULT_PROFILE_DEMOGRAPHICS: ProfileDemographics = {
  ageRange: 'unspecified',
  region: 'unspecified',
  occupation: 'unspecified'
};

export const DEFAULT_PROFILE_TONE = 'Neutral explanatory tone.';

type RawProfileTemplate = Omit<ProfileTemplate, 'demographics' | 'tone' | 'goals'> & {
  demographics?: Partial<ProfileDemographics>;
  tone?: string | null;
  goals?: string | null;
};

export function normalizeProfileTemplate(profile: RawProfileTemplate): ProfileTemplate {
  const demographics = {
    ...DEFAULT_PROFILE_DEMOGRAPHICS,
    ...(profile.demographics ?? {})
  };
  const tone = profile.tone ?? DEFAULT_PROFILE_TONE;
  const goals = profile.goals ?? undefined;
  return {
    ...profile,
    demographics,
    tone,
    goals
  };
}
