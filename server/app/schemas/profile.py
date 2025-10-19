from pydantic import BaseModel, Field


class ProfileDemographics(BaseModel):
    ageRange: str = Field(default='unspecified')
    region: str = Field(default='unspecified')
    occupation: str = Field(default='unspecified')
    gender: str | None = Field(default=None)


class ProfileTemplate(BaseModel):
    id: str
    name: str
    description: str
    primaryLanguage: str
    cultures: list[str]
    demographics: ProfileDemographics = Field(default_factory=ProfileDemographics)
    personalPreference: str | None = Field(default=None)
    tone: str = Field(default='Neutral explanatory tone.')
    goals: str | None = Field(default=None)
    createdAt: int
    updatedAt: int


class ProfileCollection(BaseModel):
    profiles: list[ProfileTemplate]
