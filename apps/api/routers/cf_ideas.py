"""Creative Flo: ideas section API. Routes live under /cf/ideas."""
import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.cf_idea import CfIdeaStatus
from ..models.user import User
from ..schemas.cf_ideas import Idea, IdeaCreate, IdeaUpdate
from ..services import cf_ideas

router = APIRouter(prefix="/cf/ideas", tags=["creative-flo"])


@router.get("", response_model=list[Idea])
def list_ideas(brand: str = Query(...), status: CfIdeaStatus | None = Query(None),
               db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return cf_ideas.list_ideas(db, current_user, brand, status)


@router.post("", response_model=Idea)
def create_idea(body: IdeaCreate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    return cf_ideas.create_idea(db, current_user, body)


@router.get("/{id}", response_model=Idea)
def get_idea(id: uuid.UUID, db: Session = Depends(get_db),
             current_user: User = Depends(get_current_user)):
    return cf_ideas.get_idea(db, current_user, id)


@router.patch("/{id}", response_model=Idea)
def update_idea(id: uuid.UUID, body: IdeaUpdate, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    return cf_ideas.update_idea(db, current_user, id, body)


@router.delete("/{id}", status_code=204)
def delete_idea(id: uuid.UUID, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    cf_ideas.delete_idea(db, current_user, id)
    return Response(status_code=204)
