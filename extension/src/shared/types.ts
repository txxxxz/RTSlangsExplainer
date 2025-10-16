export type ExplainMode = 'quick' | 'deep';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SourceReference {
  title: string;
  url: string;
  credibility: ConfidenceLevel;
  excerpt?: string;
}

export interface QuickExplainResponse {
  requestId: string;
  literal: string;
  context: string;
  languages: {
    primary: string;
    secondary?: string;
  };
  detectedAt: number;
  expiresAt: number;
}

export interface CrossCultureInsight {
  profileId: string;
  profileName: string;
  analogy: string;
  confidence: ConfidenceLevel;
  notes?: string;
}

export interface DeepExplainResponse {
  requestId: string;
  background: string;
  crossCulture: CrossCultureInsight[];
  sources: SourceReference[];
  confidence: ConfidenceLevel;
  confidenceNotes?: string;
  reasoningNotes?: string;
  profileId?: string;
  generatedAt: number;
}

export interface ExplainRequestPayload {
  requestId: string;
  mode: ExplainMode;
  subtitleText: string;
  surrounding?: string;
  timestamp: number;
  profileId?: string;
  profile?: ProfileTemplate;
  profiles?: ProfileTemplate[];
  languages: {
    primary: string;
    secondary?: string;
  };
}

export interface ProfileDemographics {
  ageRange: string;
  region: string;
  occupation: string;
  gender?: string;
}

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  primaryLanguage: string;
  cultures: string[];
  demographics: ProfileDemographics;
  tone: string;
  goals?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CachedExplainRecord {
  key: string;
  quick?: QuickExplainResponse;
  deep?: DeepExplainResponse;
  profileId?: string;
  updatedAt: number;
}

export type DeepExplainPartial = Partial<DeepExplainResponse> & {
  requestId: string;
};
