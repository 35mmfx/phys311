"""Locate local Python packages and find project-relative directories."""

from __future__ import annotations

import inspect
import os
import sys
from pathlib import Path
from typing import Iterable, Sequence

__all__ = ["add_to_path", "find_package_dir", "project_root", "PackageNotFoundError"]

DEFAULT_SUBDIRS: tuple[str, ...] = ("", "src", "lib", "python", "code")
DEFAULT_ROOT_MARKERS: tuple[str, ...] = (
    "pyproject.toml",
    "setup.cfg",
    "setup.py",
    ".git",
    "requirements.txt",
)
MAX_DEPTH = 12


class PackageNotFoundError(ImportError):
    """Raised when the requested package cannot be located on disk."""


def _caller_dir(stacklevel: int = 2) -> Path | None:
    """Return the directory of the calling source file, when available."""
    try:
        frame = inspect.stack()[stacklevel]
    except (IndexError, ValueError):
        return None
    filename = frame.filename
    if not filename or filename.startswith("<"):
        return None
    try:
        return Path(filename).resolve().parent
    except OSError:
        return None


def _seed_roots(
    search_roots: Iterable[os.PathLike[str] | str] | None,
) -> list[Path]:
    seeds: list[Path] = []
    if search_roots:
        seeds.extend(Path(root).expanduser().resolve() for root in search_roots)

    caller = _caller_dir(stacklevel=4)
    if caller is not None:
        seeds.append(caller)

    try:
        seeds.append(Path.cwd().resolve())
    except OSError:
        pass

    env_root = os.environ.get("PROJECT_ROOT")
    if env_root:
        seeds.append(Path(env_root).expanduser().resolve())

    return seeds


def _candidate_roots(seeds: Sequence[Path]) -> list[Path]:
    """Return each seed and its ancestors, de-duplicated nearest-first."""
    seen: set[Path] = set()
    roots: list[Path] = []
    for seed in seeds:
        for depth, directory in enumerate((seed, *seed.parents)):
            if depth > MAX_DEPTH:
                break
            if directory not in seen:
                seen.add(directory)
                roots.append(directory)
    return roots


def _is_importable(directory: Path, name: str) -> bool:
    """Check for a package or module named ``name`` within ``directory``."""
    target = directory / name
    if (target / "__init__.py").is_file():
        return True
    if target.is_dir() and any(target.glob("*.py")):
        return True
    return (directory / f"{name}.py").is_file()


def find_package_dir(
    name: str,
    *,
    subdirs: Sequence[str] = DEFAULT_SUBDIRS,
    search_roots: Iterable[os.PathLike[str] | str] | None = None,
) -> Path | None:
    """Return the parent directory that should be added to ``sys.path``."""
    for root in _candidate_roots(_seed_roots(search_roots)):
        for subdir in subdirs:
            directory = root / subdir if subdir else root
            if directory.is_dir() and _is_importable(directory, name):
                return directory
    return None


def add_to_path(
    name: str,
    *,
    subdirs: Sequence[str] = DEFAULT_SUBDIRS,
    search_roots: Iterable[os.PathLike[str] | str] | None = None,
    required: bool = True,
) -> Path | None:
    """Find a package and prepend its parent directory to ``sys.path``."""
    directory = find_package_dir(
        name,
        subdirs=subdirs,
        search_roots=search_roots,
    )
    if directory is None:
        if required:
            raise PackageNotFoundError(
                f"Could not locate {name!r} starting from {Path.cwd()}. "
                f"Searched subdirectories {list(subdirs)} of the working "
                "directory, the calling file's directory, and their parents. "
                "Set PROJECT_ROOT or pass search_roots=[...] to override."
            )
        return None

    entry = str(directory)
    if entry not in sys.path:
        sys.path.insert(0, entry)
    return directory


def project_root(
    markers: Sequence[str] = DEFAULT_ROOT_MARKERS,
    *,
    start: os.PathLike[str] | str | None = None,
) -> Path:
    """Return the nearest ancestor containing a project marker."""
    base = Path(start).expanduser().resolve() if start else Path.cwd().resolve()
    for directory in (base, *base.parents):
        if any((directory / marker).exists() for marker in markers):
            return directory
    return base
