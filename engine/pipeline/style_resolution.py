"""Resolve an approved style and pin the version used by an edit workspace."""
import json
from pathlib import Path

SETUP_MESSAGE = "Set up your editing style first so I edit in your look"
NO_STYLE_DETAIL = "This brand has no approved style yet"


class StyleUnavailable(Exception):
    pass


def active(call, brand, asset_id=None):
    args = ["style-active", "--brand", brand]
    if asset_id:
        args += ["--asset", asset_id]
    try:
        result = call(*args, write=False)
    except Exception as exc:
        detail = getattr(exc, "detail", "") or str(exc)
        if NO_STYLE_DETAIL.casefold() in detail.casefold():
            raise StyleUnavailable(SETUP_MESSAGE) from exc
        raise
    if not isinstance(result, dict) or not all(result.get(k) for k in ("style_id", "version_id", "design_md")):
        raise ValueError("The approved style response is incomplete.")
    return result


def pin(workspace, current, brand, asset_id, read, write):
    """Default updates do not restyle an old video. Changing an override does."""
    workspace = Path(workspace)
    marker = workspace / "STYLE.version"
    try:
        previous = json.loads(read(marker))
    except (OSError, ValueError):
        previous = {}
    same_target = previous.get("brand") == brand and previous.get("asset_id") in (None, asset_id)
    old = previous.get("active") or {}
    same_selection = (old.get("source") == current.get("source") and
                      (current.get("source") == "default" or old.get("style_id") == current.get("style_id")))
    chosen = old if same_target and same_selection and old.get("version_id") and old.get("design_md") else current
    write(workspace / "STYLE.md", chosen["design_md"])
    write(workspace / "STYLE.json", json.dumps(chosen.get("style_json") or {}, indent=2))
    write(workspace / "STYLE.css", chosen.get("skin_css") or "")
    write(marker, json.dumps({"brand": brand, "asset_id": asset_id, "active": chosen}, indent=2))
    return chosen


def resolve(call, workspace, brand, asset_id, read, write):
    return pin(workspace, active(call, brand, asset_id), brand, asset_id, read, write)
