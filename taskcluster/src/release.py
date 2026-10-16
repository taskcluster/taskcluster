"""Decide whether a decision task is building a release, a staging release, or neither."""

import re
from dataclasses import dataclass
from typing import Optional

_RELEASE_TAG = re.compile(r"refs/tags/v(\d+\.\d+\.\d+)")
_STAGING_BRANCH = re.compile(r"refs/heads/staging-release/v(\d+\.\d+\.\d+)")


@dataclass(frozen=True)
class ReleaseInfo:
    version: str
    staging: bool
    repo: str


def release_info(head_ref: str, tasks_for: str, project: str) -> Optional[ReleaseInfo]:
    # Only pushes can be releases; a pull request from a branch named like a
    # staging release must never produce release tasks.
    if tasks_for != "github-push":
        return None
    # Releases come only from taskcluster/taskcluster and staging releases only
    # from taskcluster/staging-releases; the same ref in any other project (a
    # fork, or the other repo) is not a release and must not fail the decision.
    if project == "taskcluster":
        if match := _RELEASE_TAG.fullmatch(head_ref):
            return ReleaseInfo(match[1], staging=False, repo="taskcluster/taskcluster")
        if head_ref.startswith("refs/tags/v"):
            raise ValueError(f"release tags must be of the form vX.Y.Z; got {head_ref}")
    elif project == "staging-releases":
        if match := _STAGING_BRANCH.fullmatch(head_ref):
            return ReleaseInfo(match[1], staging=True, repo="taskcluster/staging-releases")
    return None


# Per-toolchain task mounts and install lines for release tasks. Install lines
# go through str.format(**params) in src/job.py, so literal braces are doubled.
# The download URLs must match the templates in
# infrastructure/tooling/src/generate/generators/toolchain-sha256.js, which
# maintains taskcluster/toolchain-sha256.yml.
_TOOLCHAINS = {
    "go": (
        {
            "content": {"url": "https://go.dev/dl/{go_version}.linux-amd64.tar.gz"},
            "directory": "go",
            "format": "tar.gz",
        },
        [
            'export GOROOT="$(pwd)/go/go"',
            'export GOPATH="$(pwd)/go/path"',
            "mkdir -p ${{GOPATH}}",
            'export PATH="${{GOROOT}}/bin:${{GOPATH}}/bin:${{PATH}}"',
            "go version",
        ],
    ),
    "rust": (
        {
            "content": {
                "url": "https://static.rust-lang.org/dist/rust-{rust_version}-x86_64-unknown-linux-gnu.tar.gz"
            },
            "directory": "rust",
            "format": "tar.gz",
        },
        ["./rust/rust-$RUST_VERSION-x86_64-unknown-linux-gnu/install.sh"],
    ),
    "node": (
        {
            "content": {
                "url": "https://nodejs.org/dist/v{node_version}/node-v{node_version}-linux-x64.tar.gz"
            },
            "directory": "node",
            "format": "tar.gz",
        },
        [
            'export PATH="$(pwd)/node/node-v${{NODE_VERSION}}-linux-x64/bin:${{PATH}}"',
            "node --version",
            "corepack enable",
        ],
    ),
    "uv": (
        {
            "content": {
                "url": (
                    "https://github.com/astral-sh/uv/releases/download/{uv_version}/"
                    "uv-x86_64-unknown-linux-gnu.tar.gz"
                )
            },
            "directory": "uv",
            "format": "tar.gz",
        },
        [
            'export PATH="$(pwd)/uv/uv-x86_64-unknown-linux-gnu:${{PATH}}"',
            "uv --version",
        ],
    ),
}

_SHALLOW_CLONE = [
    "git init --quiet taskcluster",
    "cd taskcluster",
    # goreleaser's release mode reads the remote URL, so fetch through origin.
    "git remote add origin {head_repository}",
    "git fetch --quiet --depth=1 origin {head_rev}",
    "git checkout --quiet FETCH_HEAD",
]
# Go stamps a binary's module version from a vX.Y.Z tag at HEAD (otherwise it
# records a pseudo-version), and goreleaser needs that tag to run in release
# mode. A release's shallow fetch has no tags, so fetch the release tag.
# Staging has no release tag, so it tags HEAD locally and never pushes it.
_FETCH_RELEASE_TAG = (
    "git fetch --quiet --depth=1 {head_repository} "
    "refs/tags/v${{RELEASE_VERSION}}:refs/tags/v${{RELEASE_VERSION}}"
)
_LOCAL_STAGING_TAG = "git tag -f v${{RELEASE_VERSION}}"
# A release must build the commit its tag points at; fail the task otherwise.
_VERIFY_RELEASE_TAG = 'test "$(git rev-parse "v${{RELEASE_VERSION}}^{{commit}}")" = "$(git rev-parse HEAD)"'


def toolchain_setup(toolchains, yarn_install, staging):
    """Return (install lines, mounts) for a release task that needs the given
    toolchains (a subset of go, rust, node, uv). Toolchains are always installed
    in the order go, rust, node, uv, then the checkout (with the vX.Y.Z tag at
    HEAD), then `yarn --immutable`."""
    if unknown := sorted(set(toolchains) - set(_TOOLCHAINS)):
        raise ValueError(f"unknown release toolchains: {unknown}")
    if yarn_install and "node" not in toolchains:
        raise ValueError("yarn-install requires the node release toolchain")
    install, mounts = [], []
    for name, (mount, lines) in _TOOLCHAINS.items():
        if name in toolchains:
            mounts.append(dict(mount, content=dict(mount["content"])))
            install.extend(lines)
    install.extend(_SHALLOW_CLONE)
    if staging:
        install.append(_LOCAL_STAGING_TAG)
    else:
        install.append(_FETCH_RELEASE_TAG)
        install.append(_VERIFY_RELEASE_TAG)
    if yarn_install:
        install.append("yarn --immutable")
    return install, mounts
