# Rebuild and redeploy prompt

Use this prompt when the comparison needs refreshing for a newer revision of rari PR #912.

```text
Rebuild and redeploy the CSS formal definition review app at
https://github.com/caugner/mdn-rari-cssinfo-review for the current head of
mdn/rari PR #912.

Use a dedicated worktree created from the latest `origin/main`. First inspect
the repository's README, `inputs/pins.json`, and `scripts/reproduce.py`.

Update `inputs/pins.json` so `revisions.rari-pr` is the current PR head:

    gh pr view 912 --repo mdn/rari --json headRefOid --jq .headRefOid

Keep the pinned rari main, content, and translated-content revisions unless the
task explicitly calls for refreshing the comparison baseline. The comparison
must include all configured locales except `de`, using `rari build --grep
'{{cssinfo'`.

If the PR changed the WebRef transform, WebRef schema, or its package versions,
also regenerate the frozen dependency archive and update its checksum and
metadata in `inputs/pins.json`. Do not silently reuse the old archive in that
case. If the PR only changed rendering behavior, reuse the existing dependency
archive.

Build fresh artifacts in a new temporary directory, outside the repository:

    review_work_dir="$(mktemp -d /tmp/cssinfo-refresh.XXXXXX)"
    python3 scripts/reproduce.py --work-dir "$review_work_dir"

Do not pass `--verify` for this first build, because changed PR data is
expected. This must regenerate:

- `site/data/`
- per-page comparison data
- `site/artifacts/cssinfo-<locale>.md` for every configured locale
- `site/artifacts/manifest.json`
- `site/artifacts/cssinfo-locale-diffs.zip`
- the artifact download page

Then verify that the committed generated data matches a separate regeneration:

    python3 scripts/reproduce.py \
      --work-dir "$review_work_dir" \
      --binary-dir "$review_work_dir/bin" \
      --out "$review_work_dir/verified-site" \
      --verify

Run the repository's Python and Node tests. Review the changed artifact counts,
diagnostics, and report links for obvious problems.

Commit all required source, pinned-input, generated-site, and artifact changes
as one signed conventional commit. Push the branch and fast-forward `main` to
the commit so GitHub Pages deploys it. Confirm the Pages workflow succeeds and
verify that the site, artifact landing page, ZIP, and each locale report are
publicly accessible.

In the final report, provide the commit SHA, deployed URLs, artifact hashes,
the pinned PR SHA, and any dependency-refresh decision or limitation.
```
