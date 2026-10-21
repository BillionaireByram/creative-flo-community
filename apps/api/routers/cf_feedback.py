"""Project-authorized feedback queue for the edit loop."""
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.cf_feedback import CfFeedbackStatus
from ..models.user import User
from ..schemas.cf_feedback import BrandRunNow, Claim, Done, DueAsset, Fail, Progress, QueuedRequest, Run, RunNow, WorkingRequest
from ..services import cf_feedback
from .cf_common import LimitedBodyRoute

router = APIRouter(prefix="/cf", tags=["creative-flo"], route_class=LimitedBodyRoute)


@router.get("/feedback/due", response_model=list[DueAsset])
def due(brand: str | None = Query(None), quiet_min: int = Query(10, ge=0, le=240),
        requested_only: bool = Query(False),
        db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.due(db, current_user, brand, quiet_min, requested_only)


@router.post("/feedback/assets/{asset_id}/run-now", response_model=QueuedRequest | WorkingRequest)
def run_now(asset_id: uuid.UUID, body: RunNow | None = None,
            db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.run_now(db, current_user, asset_id, body or RunNow())


@router.post("/feedback/run-now", response_model=BrandRunNow)
def run_brand_now(brand: str = Query(...), body: RunNow | None = None,
                  db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.run_brand_now(db, current_user, brand, body or RunNow())


@router.get("/feedback/runs", response_model=list[Run])
def runs(brand: str | None = Query(None), asset_id: uuid.UUID | None = Query(None),
         status: CfFeedbackStatus | None = Query(None), limit: int = Query(20, ge=1, le=200),
         db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.list_runs(db, current_user, brand, asset_id, status, limit)


@router.post("/feedback/runs", response_model=Run)
def claim(body: Claim, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.claim(db, current_user, body)


@router.post("/feedback/runs/{id}/progress", response_model=Run)
def progress(id: uuid.UUID, body: Progress, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.progress(db, current_user, id, body)


@router.post("/feedback/runs/{id}/done", response_model=Run)
def done(id: uuid.UUID, body: Done, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.done(db, current_user, id, body)


@router.post("/feedback/runs/{id}/fail", response_model=Run)
def fail(id: uuid.UUID, body: Fail, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.fail(db, current_user, id, body)


@router.post("/feedback/runs/{id}/cancel", response_model=Run)
def cancel(id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.cancel(db, current_user, id)


@router.post("/feedback/runs/{id}/retry-now", response_model=Run)
def retry_now(id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_feedback.retry_now(db, current_user, id)
