"""Creative Flo: linking a project to an editing brand is instance-admin only."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from apps.api.models.project import Project, ProjectMember, ProjectRole
from apps.api.models.user import User


@pytest.fixture
def env(real_db):
    owner = User(email=f"brand-{uuid4().hex}@test.local", name="owner")
    admin = User(email=f"admin-{uuid4().hex}@test.local", name="admin", is_superadmin=True)
    real_db.add_all([owner, admin])
    real_db.flush()
    project = Project(name="Mine", created_by=owner.id)
    real_db.add(project)
    real_db.flush()
    real_db.add_all([ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.owner),
                     ProjectMember(project_id=project.id, user_id=admin.id, role=ProjectRole.owner)])
    real_db.flush()
    actor = {"user": owner}
    with patch("apps.api.services.s3_service.ensure_bucket_exists"), patch(
        "apps.api.services.s3_service.get_s3_client", return_value=MagicMock(),
    ):
        from fastapi.testclient import TestClient
        from apps.api.main import app
        from apps.api.database import get_db
        from apps.api.middleware.auth import get_current_user

        app.dependency_overrides[get_db] = lambda: real_db
        app.dependency_overrides[get_current_user] = lambda: actor["user"]
        client = TestClient(app)
        try:
            yield SimpleNamespace(client=client, db=real_db, project=project, owner=owner, admin=admin, actor=actor)
        finally:
            client.close()
            app.dependency_overrides.clear()


def test_project_owner_cannot_claim_a_brand(env):
    brand = f"t{uuid4().hex[:10]}"
    r = env.client.put(f"/cf/projects/{env.project.id}/brand", json={"brand": brand})
    assert r.status_code == 403
    env.db.refresh(env.project)
    assert env.project.cf_brand is None


def test_instance_admin_can_link_and_unlink(env):
    env.actor["user"] = env.admin
    brand = f"t{uuid4().hex[:10]}"
    assert env.client.put(f"/cf/projects/{env.project.id}/brand", json={"brand": brand}).json()["brand"] == brand
    assert env.client.put(f"/cf/projects/{env.project.id}/brand", json={"brand": None}).json()["brand"] is None
