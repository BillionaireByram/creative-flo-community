"""The reserved "Style samples" folder never shows up in folder lists or the project's asset list."""
import uuid

import apps.api.routers.assets as assets_module
import apps.api.routers.folders as folders_module
from apps.api.models.asset import Asset, AssetType
from apps.api.models.folder import Folder, STYLE_SAMPLES_FOLDER
from apps.api.models.project import Project, ProjectMember, ProjectRole, ProjectType
from apps.api.models.user import User


def _seed(real_db):
    owner = User(email=f"ss-{uuid.uuid4()}@t.local", name="t")
    real_db.add(owner)
    real_db.flush()
    project = Project(name="t", project_type=ProjectType.personal, created_by=owner.id)
    real_db.add(project)
    real_db.flush()
    real_db.add(ProjectMember(project_id=project.id, user_id=owner.id, role=ProjectRole.owner))
    visible = Folder(project_id=project.id, name="Review", created_by=owner.id)
    hidden = Folder(project_id=project.id, name=STYLE_SAMPLES_FOLDER, created_by=owner.id)
    real_db.add_all([visible, hidden])
    real_db.flush()
    for name, folder in (("loose", None), ("in review", visible.id), ("sample", hidden.id)):
        real_db.add(Asset(project_id=project.id, name=name, asset_type=AssetType.video,
                          created_by=owner.id, folder_id=folder))
    real_db.flush()
    return owner, project, hidden


def test_reserved_folder_is_hidden_from_listings(real_db):
    owner, project, hidden = _seed(real_db)
    names = [f.name for f in folders_module.list_folders(project.id, None, real_db, owner)]
    assert names == ["Review"]
    tree = folders_module.get_folder_tree(project.id, real_db, owner)
    assert [n.name for n in tree] == ["Review"]


def test_reserved_folder_assets_are_left_out_of_the_project_list(real_db):
    owner, project, hidden = _seed(real_db)
    listed = assets_module.list_assets(project.id, include_failed=True, folder_id=None, db=real_db,
                                       current_user=owner)
    assert sorted(a.name for a in listed) == ["in review", "loose"]
    direct = assets_module.list_assets(project.id, include_failed=True, folder_id=str(hidden.id),
                                       db=real_db, current_user=owner)
    assert [a.name for a in direct] == ["sample"]


def test_agent_sees_the_reserved_folder_so_it_reuses_it(real_db, monkeypatch):
    owner, project, hidden = _seed(real_db)
    monkeypatch.setattr("apps.api.services.cf_styles.settings.cf_agent_emails", owner.email)
    names = sorted(f.name for f in folders_module.list_folders(project.id, None, real_db, owner))
    assert names == ["Review", STYLE_SAMPLES_FOLDER]
    tree = folders_module.get_folder_tree(project.id, real_db, owner)
    assert sorted(n.name for n in tree) == ["Review", STYLE_SAMPLES_FOLDER]
