"""Style Studio. Seed, trend, retry and asset-style routes extend the initial contract."""
import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.user import User
from ..schemas import cf_styles as wire
from ..services import cf_styles as service
from .cf_common import LimitedBodyRoute

router = APIRouter(prefix="/cf", tags=["creative-flo"], route_class=LimitedBodyRoute)


@router.get("/styles", response_model=list[wire.Style])
def styles(brand: str = Query(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.list_styles(db, user, brand)


@router.get("/styles/active", response_model=wire.Active)
def active(brand: str = Query(...), asset_id: uuid.UUID | None = Query(None),
           db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.active(db, user, brand, asset_id)


@router.post("/styles/seed", response_model=wire.Style)
def seed(body: wire.Seed, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.seed(db, user, body)


@router.post("/styles", response_model=wire.Style)
def create(body: wire.Create, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.create(db, user, body)


@router.get("/styles/{id}", response_model=wire.StyleDetail)
def detail(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.style_wire(db, service.load_style(db, user, id), detail=True)


@router.patch("/styles/{id}", response_model=wire.Style)
def patch(id: uuid.UUID, body: wire.Patch, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.patch(db, user, id, body)


@router.post("/styles/{id}/default", response_model=wire.Style)
def default(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.set_default(db, user, id)


@router.post("/styles/{id}/archive", response_model=wire.Style)
def archive(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.archive(db, user, id)


@router.post("/styles/{id}/improve", response_model=wire.Version)
def improve(id: uuid.UUID, body: wire.Improve, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.improve(db, user, id, body)


@router.post("/style-versions/{id}/approve", response_model=wire.Version)
def approve(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.approve(db, user, id)


@router.post("/style-versions/{id}/reject", response_model=wire.Version)
def reject(id: uuid.UUID, body: wire.Reject = wire.Reject(), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.reject(db, user, id, body)


@router.post("/style-versions/{id}/restore", response_model=wire.Version)
def restore(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.restore(db, user, id)


@router.post("/style-versions/{id}/retry", response_model=wire.Version)
def retry(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.retry(db, user, id)


@router.get("/style-builds/due", response_model=list[wire.BuildItem], response_model_exclude_unset=True)
def due(brand: str | None = Query(None), limit: int = Query(20, ge=1, le=200),
        db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.due(db, user, brand, limit)


@router.post("/style-versions/{id}/claim", response_model=wire.BuildItem, response_model_exclude_unset=True)
def claim(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.claim(db, user, id)


@router.post("/style-versions/{id}/proposed", response_model=wire.Version)
def proposed(id: uuid.UUID, body: wire.Proposed, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.proposed(db, user, id, body)


@router.post("/style-versions/{id}/fail", response_model=wire.Version)
def fail(id: uuid.UUID, body: wire.Fail, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.fail(db, user, id, body)


@router.post("/style-interviews", response_model=wire.Interview)
def interview_create(body: wire.InterviewCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.interview_create(db, user, body)


@router.get("/style-interviews/{id}", response_model=wire.Interview)
def interview(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.interview_load(db, user, id)


@router.patch("/style-interviews/{id}", response_model=wire.Interview)
def interview_patch(id: uuid.UUID, body: wire.InterviewPatch, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.interview_patch(db, user, id, body)


@router.post("/style-interviews/{id}/submit", response_model=wire.Submitted)
def interview_submit(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.interview_submit(db, user, id)


@router.get("/style-templates", response_model=list[wire.Template], response_model_exclude_unset=True)
def templates(brand: str | None = Query(None), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.templates(db, user, brand)


@router.post("/style-templates/seed")
def template_seed(body: list[dict], db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.template_seed(db, user, body)


@router.get("/style-templates/{key}", response_model=wire.Template, response_model_exclude_unset=True)
def template(key: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.template_get(db, user, key)


@router.put("/style-templates/{key}/trend", response_model=wire.Template, response_model_exclude_unset=True)
def template_trend(key: str, body: wire.Trend, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.template_trend(db, user, key, body)


def template_sample(key: str, file: UploadFile = File(...), poster: UploadFile | None = File(None),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.template_sample(db, user, key, file, poster)


# Multipart uploads use spooled files and their own size checks, not the 512 KB JSON guard.
router.add_api_route("/style-templates/{key}/sample", template_sample, methods=["PUT"],
                     response_model=wire.Template, response_model_exclude_unset=True,
                     route_class_override=APIRoute)


@router.get("/style-recommendations", response_model=list[wire.Recommendation])
def recommendations(brand: str = Query(...), db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.recommendations(db, user, brand)


@router.post("/style-recommendations", response_model=wire.Recommendation)
def recommend(body: wire.RecommendationCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.recommend(db, user, body)


@router.post("/style-recommendations/{id}/dismiss", response_model=wire.Recommendation)
def dismiss(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.recommendation_action(db, user, id, "dismissed")


@router.post("/style-recommendations/{id}/use", response_model=wire.Recommendation)
def use(id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.recommendation_action(db, user, id, "used")


@router.put("/assets/{id}/style")
def asset_style(id: uuid.UUID, body: wire.AssetStyle, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return service.set_asset_style(db, user, id, body)
