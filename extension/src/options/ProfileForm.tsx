import React, { useState } from 'react';
import type { ProfileTemplate } from '../shared/types';
import { DEFAULT_PROFILE_TONE } from '../shared/profile';

interface ProfileFormProps {
  profiles: ProfileTemplate[];
  activeProfileId?: string;
  onSave(profile: ProfileTemplate): Promise<void> | void;
  onDelete(id: string): Promise<void> | void;
  onSetActive(profile: ProfileTemplate): Promise<void> | void;
}

export const ProfileForm: React.FC<ProfileFormProps> = ({
  profiles,
  activeProfileId,
  onSave,
  onDelete,
  onSetActive
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('en');
  const [cultures, setCultures] = useState('US,UK');
  const [ageRange, setAgeRange] = useState('18-25');
  const [gender, setGender] = useState('');
  const [region, setRegion] = useState('');
  const [occupation, setOccupation] = useState('');
  const [tone, setTone] = useState(DEFAULT_PROFILE_TONE);
  const [goals, setGoals] = useState('');

  const MAX_PROFILES = 3;
  const canAddProfile = profiles.length < MAX_PROFILES;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (!canAddProfile) return;
    const now = Date.now();
    const cultureTags = cultures
      .split(',')
      .map((culture) => culture.trim())
      .filter(Boolean);
    const demographics = {
      ageRange: ageRange.trim(),
      region: region.trim(),
      occupation: occupation.trim(),
      gender: gender.trim() || undefined
    };
    await onSave({
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      primaryLanguage: primaryLanguage.trim(),
      cultures: cultureTags,
      demographics,
      tone: tone.trim(),
      goals: goals.trim() || undefined,
      createdAt: now,
      updatedAt: now
    });
    setName('');
    setDescription('');
    setCultures('US,UK');
    setAgeRange('18-25');
    setGender('');
    setRegion('');
    setOccupation('');
    setTone(DEFAULT_PROFILE_TONE);
    setGoals('');
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <p>
          You can save up to {MAX_PROFILES} cultural profiles. {profiles.length}/{MAX_PROFILES}{' '}
          used.
        </p>
        <label htmlFor="profileName">Profile Name</label>
        <input
          id="profileName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Comedy Night Learner"
        />

        <label htmlFor="profileDescription">Description</label>
        <textarea
          id="profileDescription"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Prefers literal translation with UK/US tone comparison."
        />

        <label htmlFor="primaryLanguage">Primary Language</label>
        <input
          id="primaryLanguage"
          value={primaryLanguage}
          onChange={(event) => setPrimaryLanguage(event.target.value)}
          placeholder="en"
        />

        <label htmlFor="cultures">Culture Tags (comma separated)</label>
        <input
          id="cultures"
          value={cultures}
          onChange={(event) => setCultures(event.target.value)}
          placeholder="US,UK"
        />

        <label htmlFor="ageRange">Age Range</label>
        <input
          id="ageRange"
          value={ageRange}
          onChange={(event) => setAgeRange(event.target.value)}
          placeholder="18-25"
        />

        <label htmlFor="gender">Gender (optional)</label>
        <input
          id="gender"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          placeholder="F/M/Non-binary"
        />

        <label htmlFor="region">Primary Region</label>
        <input
          id="region"
          value={region}
          onChange={(event) => setRegion(event.target.value)}
          placeholder="Hong Kong"
        />

        <label htmlFor="occupation">Occupation</label>
        <input
          id="occupation"
          value={occupation}
          onChange={(event) => setOccupation(event.target.value)}
          placeholder="University Student"
        />

        <label htmlFor="tone">Tone Guidance</label>
        <textarea
          id="tone"
          value={tone}
          onChange={(event) => setTone(event.target.value)}
          placeholder="Describe the tone (e.g., warm, humorous, scholarly)."
        />

        <label htmlFor="goals">Learning Goals (optional)</label>
        <textarea
          id="goals"
          value={goals}
          onChange={(event) => setGoals(event.target.value)}
          placeholder="Focus on sarcasm vs sincerity cues."
        />

        <button className="primary" type="submit" disabled={!canAddProfile}>
          Add Profile
        </button>
        {!canAddProfile && <p>You have reached the maximum number of profiles.</p>}
      </form>

      <div className="profiles-list">
        {profiles.map((profile) => (
          <article key={profile.id} className={profile.id === activeProfileId ? 'active' : ''}>
            <h3>{profile.name}</h3>
            <p>{profile.description}</p>
            <p>
              <strong>Language:</strong> {profile.primaryLanguage}
            </p>
            <p>
              <strong>Cultures:</strong> {profile.cultures.join(', ')}
            </p>
            <p>
              <strong>Demographics:</strong> {profile.demographics?.ageRange || 'n/a'}, {profile.demographics?.region || 'n/a'}{' '}
              {profile.demographics?.occupation ? `— ${profile.demographics.occupation}` : ''}
              {profile.demographics?.gender ? `, ${profile.demographics.gender}` : ''}
            </p>
            <p>
              <strong>Tone:</strong> {profile.tone || 'Not specified'}
            </p>
            {profile.goals && (
              <p>
                <strong>Goals:</strong> {profile.goals}
              </p>
            )}
            {profile.id === activeProfileId ? (
              <span className="badge badge-active">Active</span>
            ) : (
              <button
                className="primary outline"
                type="button"
                onClick={() => onSetActive(profile)}
              >
                Set Active
              </button>
            )}
            <button
              className="danger"
              type="button"
              onClick={() => onDelete(profile.id)}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
    </div>
  );
};
