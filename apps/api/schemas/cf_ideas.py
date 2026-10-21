"""Request limits and the public Ideas & Scripts contract."""
import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

from ..models.cf_idea import CfIdeaStatus

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class BeatInput(BaseModel):
    id: str = ""
    text: str = Field(default="", max_length=5000)
    broll: str | None = Field(default=None, max_length=1000)


class ScriptInput(BaseModel):
    beats: list[BeatInput] = Field(default_factory=list, max_length=200)
    cta: str = Field(default="", max_length=2000)


class IdeaFields(BaseModel):
    hook: str | None = Field(default=None, max_length=500)
    angle: str | None = Field(default=None, max_length=20000)
    pillar: str | None = Field(default=None, max_length=64)
    format: str | None = Field(default=None, max_length=64)
    script: ScriptInput | None = None
    script_text: str | None = Field(default=None, max_length=100000)
    notes: str | None = Field(default=None, max_length=20000)


class IdeaCreate(IdeaFields):
    brand: str
    title: Title
    status: CfIdeaStatus = CfIdeaStatus.idea


class IdeaUpdate(IdeaFields):
    title: Title | None = None
    status: CfIdeaStatus | None = None
    tracker_cf_id: str | None = Field(default=None, max_length=16, pattern=r"^[A-Za-z0-9-]{1,16}$")
    asset_id: uuid.UUID | None = None
    position: int | None = Field(default=None, ge=0)

    @field_validator("title", "status", "position", mode="before")
    @classmethod
    def not_null(cls, value):
        # Omitted fields keep their defaults; explicitly supplied null is invalid.
        if value is None:
            raise ValueError("Field cannot be null")
        return value


class Beat(BaseModel):
    id: str
    text: str
    broll: str | None


class Script(BaseModel):
    beats: list[Beat]
    cta: str


class Idea(BaseModel):
    id: uuid.UUID
    brand: str | None
    project_id: uuid.UUID
    title: str
    hook: str | None
    angle: str | None
    pillar: str | None
    format: str | None
    status: CfIdeaStatus
    script: Script
    script_text: str | None
    teleprompter_text: str
    notes: str | None
    tracker_cf_id: str | None
    asset_id: uuid.UUID | None
    position: int
    created_at: datetime
    updated_at: datetime
