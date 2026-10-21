"""Wire contract shared by the edit loop and the review UI."""
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer

from ..models.cf_feedback import CfFeedbackRequestSource, CfFeedbackStatus
from .comment import AnnotationResponse


class Claim(BaseModel):
    route: Literal["graphics", "cut"] = "graphics"
    style_version_id: uuid.UUID | None = None
    asset_id: uuid.UUID
    comment_ids: list[uuid.UUID] = Field(min_length=1)

    @field_validator("comment_ids")
    @classmethod
    def unique_ids(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("comment_ids must be unique")
        return value


class Progress(BaseModel):
    style_version_id: uuid.UUID | None = None
    note: str = Field(max_length=500)


class Done(BaseModel):
    style_version_id: uuid.UUID | None = None
    version_id: uuid.UUID
    summary: str = Field(max_length=2000)
    replies: dict[uuid.UUID, str] | None = None


class Fail(BaseModel):
    error: str = Field(max_length=1000)
    terminal: bool = False   # an owner action is needed (for example no style yet): tell them now, do not retry


class RunNow(BaseModel):
    source: CfFeedbackRequestSource | None = None


class QueuedRequest(BaseModel):
    state: Literal["queued"] = "queued"
    request_id: uuid.UUID


class WorkingRequest(BaseModel):
    state: Literal["working"] = "working"
    run_id: uuid.UUID


class BrandRunNow(BaseModel):
    queued: list[uuid.UUID]
    working: list[uuid.UUID]
    nothing: int


class Run(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    style_version_id: uuid.UUID | None = None

    @model_serializer(mode="wrap")
    def known_style_only(self, handler):
        data = handler(self)
        if self.style_version_id is None:
            data.pop("style_version_id", None)
        return data

    id: uuid.UUID
    project_id: uuid.UUID
    brand: str
    asset_id: uuid.UUID
    version_id: uuid.UUID
    comment_ids: list[uuid.UUID]
    status: CfFeedbackStatus
    attempt: int
    progress: str | None
    summary: str | None
    new_version_id: uuid.UUID | None
    error: str | None
    claimed_by: uuid.UUID | None
    created_at: datetime
    claimed_at: datetime | None
    completed_at: datetime | None


class FeedbackRunInfo(BaseModel):
    id: uuid.UUID | None
    status: CfFeedbackStatus
    progress: str | None
    attempt: int
    new_version_number: int | None
    requested_at: datetime | None = None


class DueComment(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    parent_body: str | None
    body: str
    timecode_start: float | None
    timecode_end: float | None
    version_id: uuid.UUID
    version_number: int
    annotation: AnnotationResponse | None
    author_name: str
    created_at: datetime


class LatestVersion(BaseModel):
    id: uuid.UUID
    number: int


class DueAsset(BaseModel):
    asset_id: uuid.UUID
    asset_name: str
    cf_id: str | None
    project_id: uuid.UUID
    project_name: str
    folder_name: str | None
    latest_version: LatestVersion
    comments: list[DueComment]
    requested: bool = False
