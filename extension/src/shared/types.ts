export type ExplainMode = 'quick' | 'deep';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SourceReference {
  title: string;
  url: string;
  credibility: ConfidenceLevel;
  excerpt?: string;
}

export interface DeepBackground {
  summary: string;
  detail?: string;
  highlights: string[];
}

export interface DeepConfidenceMeta {
  level: ConfidenceLevel;
  notes?: string;
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
  headline?: string;
  context?: string;
}

export interface DeepExplainResponse {
  requestId: string;
  background: DeepBackground;
  crossCulture: CrossCultureInsight[];
  sources: SourceReference[];
  confidence: DeepConfidenceMeta;
  reasoningNotes?: string;
  profileId?: string;
  generatedAt: number;
  language?: string;
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
  personalPreference?: string;
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

export type ModelProvider =
  | 'openai'
  | 'azure-openai'
  | 'anthropic'
  | 'google-gemini'
  | 'deepseek'
  | 'self-hosted';

export interface ModelQualitySettings {
  temperature: number;
  topP: number;
  maxTokens: number;
  formality: 'formal' | 'informal';
  literalness: number;
  glossaryEnabled: boolean;
}

export interface ModelConfig extends ModelQualitySettings {
  id: string;
  provider: ModelProvider;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntry {
  id: string;
  query: string;
  resultSummary?: string;
  profileId?: string;
  profileName?: string;
  deepResponse?: DeepExplainResponse;
  createdAt: number;
}

export interface LinguaLensSettings {
  defaultModelId?: string;
  theme?: 'system' | 'light' | 'dark';
  glossaryEnabledByDefault?: boolean;
  syncMode?: 'local' | 'cloud';
  updatedAt: number;
}
