"""Style Studio wire shapes shared by the app and build worker."""
import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Answers(BaseModel):
    model_config = ConfigDict(extra="allow")
    version: str = "style-lab-v3"
    ratings: dict[str, Literal["love", "maybe", "no"] | None] = Field(default_factory=dict)
    notes: dict[str, str | None] = Field(default_factory=dict)
    answers: dict[str, Any] = Field(default_factory=dict)


class Create(Input):
    brand: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    from_template: str | None = Field(default=None, max_length=100, pattern=r"^[a-z0-9-]+$")
    copy_of: uuid.UUID | None = None

    @model_validator(mode="after")
    def one_source(self):
        if self.from_template and self.copy_of:
            raise ValueError("Choose a template or a style to copy")
        return self


class Patch(Input):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def no_null_fields(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Use text for name and description")
        return self


class Improve(Input):
    request: str = Field(min_length=1, max_length=4000)


class Reject(Input):
    note: str | None = Field(default=None, max_length=2000)


class Proposed(Input):
    design_md: str = Field(min_length=1)
    style_json: dict[str, Any]
    skin_css: str
    preview: dict[str, Any]
    changelog: str = Field(max_length=2000)
    sample_asset_id: uuid.UUID | None = None


class Fail(Input):
    error: str = Field(min_length=1, max_length=1000)


class InterviewCreate(Input):
    brand: str = Field(min_length=1, max_length=64)
    style_id: uuid.UUID | None = None
    mode: Literal["new", "improve"] = "new"

    @model_validator(mode="after")
    def improve_has_style(self):
        if self.mode == "improve" and self.style_id is None:
            raise ValueError("Choose a style to improve")
        return self


class InterviewPatch(Input):
    answers: Answers


class AssetStyle(Input):
    style_id: uuid.UUID | None


class TemplateSeed(Input):
    key: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=300)
    best_for: str = Field(min_length=1, max_length=300)
    why_it_works: str = Field(min_length=1, max_length=600)
    tags: list[str]
    design_md: str = Field(min_length=1)
    style_json: dict[str, Any]
    preview: dict[str, Any]
    sort: int = 0
    active: bool = True
    sample_url: str | None = None
    trend_note: str | None = Field(default=None, max_length=600)

    @field_validator("sample_url")
    @classmethod
    def playable_url(cls, value):
        from urllib.parse import urlsplit
        if value is not None and (urlsplit(value).scheme not in ("http", "https") or not urlsplit(value).netloc):
            raise ValueError("Use a complete video URL")
        return value


class Trend(Input):
    trend_note: str = Field(max_length=600)


class Seed(Input):
    brand: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    design_md: str = Field(min_length=1)
    style_json: dict[str, Any]
    skin_css: str
    preview: dict[str, Any]
    answers: Answers
    make_default: bool = True


SECTION_KEYS = ("brand", "platforms", "templates", "looks", "type", "captions", "hooks", "transitions",
                "motion", "grade", "music", "pace", "other")


class RecommendationCreate(Input):
    brand: str = Field(min_length=1, max_length=64)
    interview_id: uuid.UUID | None = None
    kind: Literal["template", "choice", "improvement"]
    payload: dict[str, Any]
    reason: str = Field(min_length=1, max_length=400)

    @model_validator(mode="after")
    def valid_payload(self):
        required = {"template": ("template_key",), "choice": ("section", "choice"), "improvement": ("style_id", "change")}[self.kind]
        if any(key not in self.payload for key in required):
            raise ValueError("Recommendation is missing its choice")
        for key in required:
            if key != "choice" and (not isinstance(self.payload[key], str) or not self.payload[key].strip()):
                raise ValueError("Recommendation fields must contain text")
        if self.kind == "choice":
            choice = self.payload["choice"]
            if self.payload["section"] not in SECTION_KEYS:
                raise ValueError("Choose one of the interview sections")
            # Either one question answered ({field, value}) or one sample rated ({sample_id, rating}).
            by_field = isinstance(choice, dict) and isinstance(choice.get("field"), str) and "value" in choice
            by_sample = (isinstance(choice, dict) and isinstance(choice.get("sample_id"), str)
                         and choice.get("rating") in ("love", "maybe", "no"))
            if not (by_field or by_sample):
                raise ValueError("A choice names a question and its answer, or a sample and its rating")
        if self.kind == "improvement":
            uuid.UUID(self.payload["style_id"])
            if len(self.payload["change"]) > 4000:
                raise ValueError("Change must be 4000 characters or fewer")
        return self


class Version(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    style_id: uuid.UUID
    version: int
    status: Literal["building", "proposed", "approved", "rejected", "failed"]
    design_md: str
    style_json: dict
    skin_css: str
    answers: dict | None
    request: str | None
    changelog: str
    sample_asset_id: uuid.UUID | None
    sample_url: str | None = None
    preview: dict
    error: str | None
    attempt: int
    created_by: uuid.UUID
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    created_at: datetime


class Style(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    brand: str
    name: str
    slug: str
    description: str
    is_default: bool
    origin: Literal["interview", "template", "copy", "import"]
    template_key: str | None
    current_version_id: uuid.UUID | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    current_version: Version | None = None
    open_proposals: int = 0
    building_count: int = 0


class StyleDetail(Style):
    versions: list[Version]


class Interview(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    brand: str
    style_id: uuid.UUID | None
    mode: Literal["new", "improve"]
    answers: dict
    status: Literal["in_progress", "submitted", "built", "abandoned"]
    created_at: datetime
    updated_at: datetime


class Submitted(BaseModel):
    style_id: uuid.UUID
    version_id: uuid.UUID


class Template(TemplateSeed):
    model_config = ConfigDict(from_attributes=True)
    poster_url: str | None = None
    trend_updated_at: datetime | None = None
    recommended_for_brand: bool | None = None


class BuildItem(BaseModel):
    version_id: uuid.UUID
    style_id: uuid.UUID
    project_id: uuid.UUID
    brand: str
    style_name: str
    style_slug: str
    version: int
    mode: Literal["new", "improve"]
    answers: dict | None
    request: str | None
    attempt: int
    base_version: Version | None
    template: Template | None


class Active(BaseModel):
    style_id: uuid.UUID
    name: str
    slug: str
    version_id: uuid.UUID
    version: int
    design_md: str
    style_json: dict
    skin_css: str
    source: Literal["asset", "default"]


class Recommendation(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    brand: str
    interview_id: uuid.UUID | None
    kind: Literal["template", "choice", "improvement"]
    payload: dict
    reason: str
    status: Literal["open", "used", "dismissed"]
    created_by: uuid.UUID
    created_at: datetime
