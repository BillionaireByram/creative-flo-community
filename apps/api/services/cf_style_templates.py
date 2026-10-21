"""Validate and seed the shared template library without replacing live trend data."""
import json
import logging
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert

from ..models.cf_style import CfStyleTemplate
from ..schemas.cf_styles import TemplateSeed

log = logging.getLogger(__name__)


def validation_reason(exc):
    if isinstance(exc, ValidationError):
        return "; ".join(".".join(map(str, error["loc"])) + ": " + error["type"]
                         for error in exc.errors(include_input=False))
    return "Template files could not be read"


def load_templates_from_dir(path):
    """Return valid templates. A bad or absent folder never hides the other starters."""
    base = Path(path)
    if not base.is_dir():
        return []
    rows = []
    for folder in sorted(base.iterdir()):
        if not folder.is_dir() or folder.is_symlink():
            continue
        try:
            files = [folder / name for name in ("template.json", "DESIGN.md", "style.json")]
            if any(file.is_symlink() for file in files):
                raise ValueError("Template files must stay in their folder")
            metadata = json.loads(files[0].read_text(encoding="utf-8"))
            rows.append(TemplateSeed.model_validate({**metadata, "key": folder.name,
                "design_md": files[1].read_text(encoding="utf-8"),
                "style_json": json.loads(files[2].read_text(encoding="utf-8"))}))
        except (OSError, ValueError, TypeError) as exc:
            log.warning("Skipping style template %s: %s", folder.name, validation_reason(exc))
    return rows


def upsert_templates(db, templates):
    """Shared startup/API seeder. The caller owns the transaction and event delivery."""
    upserted, skipped = [], []
    for item in templates:
        try:
            template = item if isinstance(item, TemplateSeed) else TemplateSeed.model_validate(item)
        except (ValidationError, TypeError, ValueError) as exc:
            key = item.get("key") if isinstance(item, dict) else None
            reason = validation_reason(exc)
            skipped.append({"key": key, "reason": reason})
            log.warning("Skipping style template %s: %s", key, reason)
            continue
        values = template.model_dump()
        statement = insert(CfStyleTemplate).values(**values)
        updates = {key: getattr(statement.excluded, key) for key in values
                   if key not in {"key", "sample_url", "trend_note"}}
        for key in ("sample_url", "trend_note"):
            updates[key] = func.coalesce(getattr(CfStyleTemplate, key), getattr(statement.excluded, key))
        db.execute(statement.on_conflict_do_update(index_elements=[CfStyleTemplate.key], set_=updates))
        if template.key not in upserted:
            upserted.append(template.key)
    return {"upserted": upserted, "skipped": skipped}


def seed_on_startup():
    """Best effort so a missing library or pending migration does not block startup."""
    from ..config import settings
    from ..database import SessionLocal
    from .cf_styles import publish_library

    try:
        templates = load_templates_from_dir(settings.cf_style_templates_dir)
        if not templates:
            return
        with SessionLocal() as db:
            result = upsert_templates(db, templates)
            db.commit()
            if result["upserted"]:
                publish_library(db)
    except Exception:
        log.warning("Style templates could not be loaded at startup")
