import React, { useEffect, useMemo, useState } from 'react';
import type { ProfileTemplate } from '../shared/types.js';
import { DEFAULT_PROFILE_TONE } from '../shared/profile.js';

interface ProfileFormProps {
  profiles: ProfileTemplate[];
  activeProfileId?: string;
  onSave(profile: ProfileTemplate): Promise<ProfileTemplate | void> | ProfileTemplate | void;
  onDelete(id: string): Promise<void> | void;
  onSetActive(profile: ProfileTemplate): Promise<void> | void;
  onReturnToExplain?(): void;
  onRefreshProfiles?(): Promise<void> | void;
}

type ViewMode = 'form' | 'success' | 'list' | 'detail';

export const ProfileForm: React.FC<ProfileFormProps> = ({
  profiles,
  activeProfileId,
  onSave,
  onDelete,
  onSetActive,
  onReturnToExplain,
  onRefreshProfiles
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>(profiles.length ? 'list' : 'form');

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
  const [personalPreference, setPersonalPreference] = useState('');

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingCreatedAt, setEditingCreatedAt] = useState<number | null>(null);

  const [useCustomAgeRange, setUseCustomAgeRange] = useState(false);
  const [useCustomGender, setUseCustomGender] = useState(false);
  const [useCustomOccupation, setUseCustomOccupation] = useState(false);
  const [useCustomTone, setUseCustomTone] = useState(false);

  const [lastSavedProfileId, setLastSavedProfileId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const AGE_RANGE_OPTIONS = useMemo(
    () => ['Under 10', '10-18', '18-25', '26-35', '36-45', '46-55', '56+', 'Prefer not to say'],
    []
  );
  const GENDER_OPTIONS = useMemo(
    () => ['Female', 'Male', 'Non-binary', 'Transgender'],
    []
  );
  const OCCUPATION_OPTIONS = useMemo(
    () => [
      'Student',
      'Teacher / Educator',
      'Researcher / Scientist',
      'IT / Software Professional',
      'Engineer',
      'Healthcare / Nurse / Doctor',
      'Government Employee / Civil Servant',
      'Management / Administration',
      'Sales / Marketing',
      'Finance / Accounting',
      'Law / Legal Professional',
      'Media / Design / Creative',
      'Service Industry / Hospitality',
      'Manufacturing / Logistics / Industrial',
      'Agriculture / Fishery / Forestry',
      'Freelancer / Self-Employed',
      'Retired',
      'Unemployed',
      'Other',
      'Prefer not to say'
    ],
    []
  );
  const TONE_OPTIONS = useMemo(
    () => [
      DEFAULT_PROFILE_TONE,
      'Friendly and casual explanations.',
      'Professional and concise summaries.',
      'Humorous, playful comparisons.',
      'Supportive coach with motivational tone.',
      'Storytelling narrative with vivid imagery.',
      'Academic and detail-oriented breakdown.'
    ],
    []
  );

  const ageRangeSelectValue = useCustomAgeRange ? 'custom' : ageRange || '';
  const genderSelectValue = useCustomGender ? 'custom' : gender || '';
  const occupationSelectValue = useCustomOccupation ? 'custom' : occupation || '';
  const toneSelectValue = useCustomTone ? 'custom' : tone || '';

  const selectedProfile = useMemo(
    () => (selectedProfileId ? profiles.find((profile) => profile.id === selectedProfileId) : undefined),
    [profiles, selectedProfileId]
  );

  const lastSavedProfile = useMemo(
    () => (lastSavedProfileId ? profiles.find((profile) => profile.id === lastSavedProfileId) : undefined),
    [profiles, lastSavedProfileId]
  );

  const MAX_PROFILES = 3;
  const canAddProfile = profiles.length < MAX_PROFILES;
  const isEditing = Boolean(editingProfileId);
  const canSubmit = isEditing || canAddProfile;

  const resetFormFields = () => {
    setName('');
    setDescription('');
    setPrimaryLanguage('en');
    setCultures('US,UK');
    setAgeRange('18-25');
    setGender('');
    setRegion('');
    setOccupation('');
    setTone(DEFAULT_PROFILE_TONE);
    setGoals('');
    setPersonalPreference('');
    setEditingProfileId(null);
    setEditingCreatedAt(null);
    setUseCustomAgeRange(false);
    setUseCustomGender(false);
    setUseCustomOccupation(false);
    setUseCustomTone(false);
  };

  const loadProfileIntoForm = (profile: ProfileTemplate) => {
    setEditingProfileId(profile.id);
    setEditingCreatedAt(profile.createdAt);
    setName(profile.name);
    setDescription(profile.description);
    setPrimaryLanguage(profile.primaryLanguage);
    setCultures(profile.cultures.join(', '));
    const age = profile.demographics?.ageRange ?? '';
    setAgeRange(age);
    setUseCustomAgeRange(age ? !AGE_RANGE_OPTIONS.includes(age) : false);
    const g = profile.demographics?.gender ?? '';
    setGender(g);
    setUseCustomGender(g ? !GENDER_OPTIONS.includes(g) : false);
    setRegion(profile.demographics?.region ?? '');
    const occ = profile.demographics?.occupation ?? '';
    setOccupation(occ);
    setUseCustomOccupation(occ ? !OCCUPATION_OPTIONS.includes(occ) : false);
    setTone(profile.tone);
    setUseCustomTone(profile.tone ? !TONE_OPTIONS.includes(profile.tone) : false);
    setGoals(profile.goals ?? '');
    setPersonalPreference(profile.personalPreference ?? '');
    setViewMode('form');
  };

  const startNewProfile = () => {
    resetFormFields();
    setViewMode('form');
    setSelectedProfileId(null);
    setLastSavedProfileId(null);
  };

  useEffect(() => {
    if (!profiles.length) {
      startNewProfile();
    }
  }, [profiles.length]);

  useEffect(() => {
    if (viewMode === 'detail' && selectedProfileId && !selectedProfile) {
      setSelectedProfileId(null);
      setViewMode(profiles.length ? 'list' : 'form');
    }
  }, [viewMode, selectedProfileId, selectedProfile, profiles.length]);

  useEffect(() => {
    if (lastSavedProfileId && !lastSavedProfile) {
      setLastSavedProfileId(null);
    }
  }, [lastSavedProfileId, lastSavedProfile]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (!canSubmit) return;
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

    const id = editingProfileId ?? crypto.randomUUID();
    const createdAt = editingCreatedAt ?? now;

    const profilePayload: ProfileTemplate = {
      id,
      name: name.trim(),
      description: description.trim(),
      primaryLanguage: primaryLanguage.trim(),
      cultures: cultureTags,
      demographics,
      personalPreference: personalPreference.trim() || undefined,
      tone: tone.trim(),
      goals: goals.trim() || undefined,
      createdAt,
      updatedAt: now
    };

    const savedProfile = (await onSave(profilePayload)) ?? profilePayload;

    const shouldActivate = !isEditing || editingProfileId === activeProfileId;
    if (shouldActivate) {
      await onSetActive(savedProfile);
    }

    resetFormFields();
    setLastSavedProfileId(savedProfile.id);
    setSelectedProfileId(savedProfile.id);
    setViewMode('success');
  };

  const handleViewAllProfiles = () => {
    setViewMode('list');
    setSelectedProfileId(null);
    if (onRefreshProfiles) {
      void onRefreshProfiles();
    }
  };

  const handleBackToExplain = () => {
    if (onReturnToExplain) {
      onReturnToExplain();
    } else {
      setViewMode('list');
    }
  };

  const handleSelectProfileCard = (profile: ProfileTemplate) => {
    setSelectedProfileId(profile.id);
    setViewMode('detail');
  };

  const handleViewProfile = (profile: ProfileTemplate) => {
    setSelectedProfileId(profile.id);
    setLastSavedProfileId(profile.id);
    setViewMode('success');
  };

  const handleEditProfile = (profile: ProfileTemplate) => {
    loadProfileIntoForm(profile);
  };

  const handleDeleteProfile = async (profile: ProfileTemplate) => {
    await onDelete(profile.id);
    if (selectedProfileId === profile.id) {
      setSelectedProfileId(null);
    }
    if (lastSavedProfileId === profile.id) {
      setLastSavedProfileId(null);
    }
    setViewMode('list');
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="profile-form">
      <h3>{isEditing ? 'Edit Profile' : 'Create New Profile'}</h3>
      <p className="profile-form__hint">
        You can save up to {MAX_PROFILES} profiles. Currently {profiles.length}/{MAX_PROFILES} used.
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
      <select
        id="ageRange"
        value={ageRangeSelectValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'custom') {
            setUseCustomAgeRange(true);
            setAgeRange('');
          } else {
            setUseCustomAgeRange(false);
            setAgeRange(value);
          }
        }}
      >
        <option value="" disabled>
          Select age range
        </option>
        {AGE_RANGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {useCustomAgeRange && (
        <input
          value={ageRange}
          onChange={(event) => setAgeRange(event.target.value)}
          placeholder="Describe the age range"
        />
      )}

      <label htmlFor="gender">Sex / Gender Identity</label>
      <select
        id="gender"
        value={genderSelectValue}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) {
            setGender('');
            setUseCustomGender(false);
          } else if (value === 'custom') {
            setUseCustomGender(true);
            setGender('');
          } else {
            setUseCustomGender(false);
            setGender(value);
          }
        }}
      >
        <option value="">Prefer not to say</option>
        {GENDER_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {useCustomGender && (
        <input
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          placeholder="Describe your identity"
        />
      )}

      <label htmlFor="region">Country / Region</label>
      <input
        id="region"
        value={region}
        onChange={(event) => setRegion(event.target.value)}
        placeholder="Hong Kong, Canada, Malaysia..."
      />

      <label htmlFor="occupation">Occupation</label>
      <select
        id="occupation"
        value={occupationSelectValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'custom') {
            setUseCustomOccupation(true);
            setOccupation('');
          } else {
            setUseCustomOccupation(false);
            setOccupation(value);
          }
        }}
      >
        <option value="" disabled>
          Select occupation
        </option>
        {OCCUPATION_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {useCustomOccupation && (
        <input
          value={occupation}
          onChange={(event) => setOccupation(event.target.value)}
          placeholder="Describe your occupation"
        />
      )}

      <label htmlFor="tone-select">Tone Guidance</label>
      <select
        id="tone-select"
        value={toneSelectValue}
        onChange={(event) => {
          const value = event.target.value;
          if (value === 'custom') {
            setUseCustomTone(true);
            setTone('');
          } else {
            setUseCustomTone(false);
            setTone(value);
          }
        }}
      >
        <option value="" disabled>
          Select tone preference
        </option>
        {TONE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      <textarea
        id="tone"
        value={tone}
        onChange={(event) => {
          const value = event.target.value;
          setTone(value);
          setUseCustomTone(!TONE_OPTIONS.includes(value));
        }}
        placeholder="Describe the tone (e.g., warm, humorous, scholarly)."
      />

      <label htmlFor="personalPreference">Personal Preference</label>
      <textarea
        id="personalPreference"
        value={personalPreference}
        onChange={(event) => setPersonalPreference(event.target.value)}
        placeholder='Describe how you want explanations delivered (e.g., "Explain like a friendly princess with magical metaphors").'
      />

      <label htmlFor="goals">Learning Goals</label>
      <textarea
        id="goals"
        value={goals}
        onChange={(event) => setGoals(event.target.value)}
        placeholder="Focus on sarcasm vs sincerity cues."
      />

      <div className="form-actions">
        <button className="primary" type="submit" disabled={!canSubmit}>
          {isEditing ? 'Save Profile' : 'Add Profile'}
        </button>
        {isEditing && (
          <button type="button" className="primary outline" onClick={startNewProfile}>
            Cancel
          </button>
        )}
        <button type="button" className="profile-summary__secondary" onClick={handleViewAllProfiles}>
          View All Profiles
        </button>
      </div>
      {!canSubmit && !isEditing && <p className="profile-form__hint">You have reached the profile limit.</p>}
    </form>
  );

  const renderSuccess = () => (
    <div className="profile-success">
      <h3>Add Successfully</h3>
      <p>
        {lastSavedProfile
          ? `"${lastSavedProfile.name}" is now active. What would you like to do next?`
          : 'Your profile is active and ready to use.'}
      </p>
      <div className="profile-success__actions">
        <button type="button" className="primary outline" onClick={handleViewAllProfiles}>
          All Profiles
        </button>
        <button type="button" className="primary" onClick={startNewProfile} disabled={!canAddProfile}>
          Add Profile
        </button>
        <button type="button" className="profile-summary__secondary" onClick={handleBackToExplain}>
          Back
        </button>
      </div>
      {!canAddProfile && (
        <p className="profile-summary__hint">Remove an existing profile before adding a new one.</p>
      )}
    </div>
  );

  const renderList = () => (
    <div className="profile-list">
      <div className="profile-list__header">
        <h3>All Profiles</h3>
        <div className="profile-list__actions">
          <button type="button" className="primary" onClick={startNewProfile} disabled={!canAddProfile}>
            Add Profile
          </button>
          <button type="button" className="profile-summary__secondary" onClick={handleBackToExplain}>
            Back
          </button>
        </div>
      </div>
      {profiles.length === 0 ? (
        <p className="profile-summary__hint">No profiles yet. Create one to personalize Deep Explain.</p>
      ) : (
        <div className="profile-cards">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className={[
                'profile-card',
                profile.id === activeProfileId ? 'active' : '',
                profile.id === lastSavedProfileId ? 'latest' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <header>
                <h4>{profile.name}</h4>
                {profile.id === activeProfileId && <span className="badge badge-active">Active</span>}
              </header>
              <p className="profile-card__description">{profile.description}</p>
              <p className="profile-card__meta">
                {profile.demographics?.ageRange || 'Age n/a'} · {profile.demographics?.region || 'Region n/a'}
              </p>
              <p className="profile-card__meta">Tone: {profile.tone}</p>
              <div className="profile-card__actions">
                <button
                  type="button"
                  className="primary outline"
                  onClick={() => handleViewProfile(profile)}
                >
                  View
                </button>
                <button
                  type="button"
                  className="profile-summary__secondary"
                  onClick={() => handleSelectProfileCard(profile)}
                >
                  Details
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );

  const renderDetail = () => {
    if (!selectedProfile) {
      return (
        <div className="profile-detail">
          <p>Profile not found.</p>
          <button type="button" className="profile-summary__secondary" onClick={handleViewAllProfiles}>
            Back to all profiles
          </button>
        </div>
      );
    }

    return (
      <div className="profile-detail">
        <div className="profile-detail__header">
          <button type="button" className="profile-summary__secondary" onClick={handleViewAllProfiles}>
            ← All Profiles
          </button>
        </div>
        <h3>{selectedProfile.name}</h3>
        <p className="profile-detail__description">{selectedProfile.description}</p>
        <dl>
          <div>
            <dt>Primary Language</dt>
            <dd>{selectedProfile.primaryLanguage}</dd>
          </div>
          <div>
            <dt>Cultures</dt>
            <dd>{selectedProfile.cultures.join(', ') || 'n/a'}</dd>
          </div>
          <div>
            <dt>Demographics</dt>
            <dd>
              {selectedProfile.demographics?.ageRange || 'Age n/a'} ·{' '}
              {selectedProfile.demographics?.region || 'Region n/a'} ·{' '}
              {selectedProfile.demographics?.occupation || 'Occupation n/a'}{' '}
              {selectedProfile.demographics?.gender ? `· ${selectedProfile.demographics.gender}` : ''}
            </dd>
          </div>
          <div>
            <dt>Tone</dt>
            <dd>{selectedProfile.tone}</dd>
          </div>
          {selectedProfile.personalPreference && (
            <div>
              <dt>Persona Preference</dt>
              <dd>{selectedProfile.personalPreference}</dd>
            </div>
          )}
          {selectedProfile.goals && (
            <div>
              <dt>Learning Goals</dt>
              <dd>{selectedProfile.goals}</dd>
            </div>
          )}
        </dl>
        <div className="profile-detail__actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              void onSetActive(selectedProfile);
            }}
          >
            Set Active
          </button>
          <button
            type="button"
            className="primary outline"
            onClick={() => loadProfileIntoForm(selectedProfile)}
          >
            Edit
          </button>
          <button type="button" className="danger" onClick={() => handleDeleteProfile(selectedProfile)}>
            Delete
          </button>
        </div>
      </div>
    );
  };

  switch (viewMode) {
    case 'form':
      return <div className="profile-shell">{renderForm()}</div>;
    case 'success':
      return <div className="profile-shell profile-shell--success">{renderSuccess()}</div>;
    case 'list':
      return <div className="profile-shell">{renderList()}</div>;
    case 'detail':
      return <div className="profile-shell">{renderDetail()}</div>;
    default:
      return <div className="profile-shell">{renderForm()}</div>;
  }
};
