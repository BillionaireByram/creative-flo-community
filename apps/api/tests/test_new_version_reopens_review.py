"""Creative Flo: a new version must not inherit a human approval of the old footage.

Both handlers that create versions (upload.initiate_upload with asset_id, and
assets.initiate_new_version) move an approved or rejected asset back to in_review.
"""
import pytest

from apps.api.models.asset import Asset, AssetStatus, AssetType

from .test_version_numbering import _call, _seed


@pytest.mark.parametrize("path", ["initiate_upload", "initiate_new_version"])
@pytest.mark.parametrize("before,after", [
    (AssetStatus.approved, AssetStatus.in_review),
    (AssetStatus.rejected, AssetStatus.in_review),
    (AssetStatus.draft, AssetStatus.draft),
    (AssetStatus.in_review, AssetStatus.in_review),
])
def test_new_version_reopens_review(real_db, monkeypatch, path, before, after):
    owner, project = _seed(real_db, monkeypatch)
    asset = Asset(project_id=project.id, name="t", asset_type=AssetType.video,
                  created_by=owner.id, status=before)
    real_db.add(asset)
    real_db.flush()

    _call(path, real_db, owner, project, asset)

    real_db.refresh(asset)
    assert asset.status == after
