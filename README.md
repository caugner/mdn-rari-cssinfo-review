# CSS formal definition review

A static comparison of the `cssinfo` tables produced by rari main and [PR #912](https://github.com/mdn/rari/pull/912), including its dependency #911.

The snapshot covers 2,720 pages across en-US, es, fr, ja, ko, pt-BR, ru, zh-CN, and zh-TW. German is excluded. Both builds use the same content and translated-content revisions, fetched from `origin/main` on 2026-09-16.

## Explore

Serve the committed site with Python 3:

```sh
python3 -m http.server 8765 --directory site
```

Open <http://localhost:8765>. The page list starts with en-US. Expand a page and choose a locale under "This page in other locales" to keep its before/after table beside the en-US review. A row summary compares affected definitions and change types, using the pinned localized row labels. Matching change types do not establish semantic equivalence of translated wording. Locales absent from this macro snapshot are shown as "Not in snapshot", which does not imply that the translation does not exist.

Filter by locale, title/slug, status, row, and change type. Expand a page for rendered values, a word diff, the original HTML diff, and macro diagnostics. The repeated-changes view groups identical row changes within a locale. Select a group to explore its affected pages.

Filters, sort order, pagination, group selection, a selected page, and its comparison locale are stored in the URL fragment. "Copy view link" shares the entire view. "Link to this page" adds the page selection. Browser Back and Forward restore previous views.

## Locale diff artifacts

Download one self-contained Markdown report per locale from the site's `artifacts/` directory, or download all nine as `artifacts/cssinfo-locale-diffs.zip`. Each report includes a review prompt, pinned provenance, every page in the locale, complete table HTML diffs, and macro diagnostic deltas. Identical full-table diffs are grouped with their complete page lists. No pages or diff hunks are truncated.

The prompt asks for evidence-backed improvements, regressions, and changes requiring verification, with severity, confidence, affected page counts, and examples. A new WebRef value is not automatically treated as an improvement. Larger reports are several hundred KiB; use file-based review and account for every group when working in batches.

Regenerate artifacts from the committed comparison data without rebuilding rari:

```sh
python3 scripts/export_locale_diffs.py
```

The full reproduction script also regenerates these artifacts. The manifest records report sizes, coverage, and SHA-256 checksums; the ZIP has fixed entry timestamps for reproducible packaging.

## Reproduce

Requirements: Git, Python 3.12+, Rust 1.97, a C/C++ toolchain, network access for Git and Cargo, and enough disk space for two Rust build directories and the content checkouts. The site has no JavaScript package dependencies.

```sh
rustup toolchain install 1.97
python3 scripts/reproduce.py --verify
```

The script:

1. Checks out the exact Git revisions in `inputs/pins.json` in detached worktrees outside this repo. It never switches existing checkouts.
2. Verifies and extracts `inputs/dependencies.tar.gz`, a frozen snapshot of public dependency data.
3. Compiles each rari revision using its committed Cargo.lock and a separate Cargo target directory.
4. Runs each binary with the same content snapshots, the explicit locale allowlist, `--skip-updates`, and `build --grep '{{cssinfo'`.
5. Records build logs and macro issues, extracts the formal definition tables, and removes unrelated build output to conserve disk space.
6. Generates the site and checks every data file against the committed snapshot when `--verify` is supplied.

The default scratch directory is the system temporary directory's `rari-cssinfo-reproduce`. Choose a different directory with `--work-dir`. It must be outside this repository. Failures retain their logs there. The generator distinguishes missing output, missing tables, unchanged tables, and changed tables. It fails if a built documentation page was not in the source inventory.

To reuse existing local Git object databases without changing those checkouts:

```sh
python3 scripts/reproduce.py --local-repos "$HOME/github/mdn" --verify
```

For subsequent runs, the script's `bin/` directory contains compiled binaries and `binaries.json`, which binds each binary's SHA-256 to its source revision. Reuse them to skip compilation:

```sh
python3 scripts/reproduce.py \
  --binary-dir /path/to/previous-work-dir/bin \
  --out /tmp/cssinfo-reproduced-site \
  --verify
```

Use `--out` to keep the committed site unchanged while checking reproduction. Without `--verify`, the script regenerates the output without comparing it to the committed dataset.

## Comparison scope

The comparison extracts `table.properties` from the rendered document prose. Rows are paired by table number and localized row label, with occurrence numbers for repeated labels. Text comparison decodes HTML entities and collapses whitespace. HTML comparison retains links and formatting. Renamed labels appear as a removed and an added row. Table-level markup differences remain visible in the original HTML diff even when individual row values are identical.

The UI sanitizes rendered value fragments and resolves relative links against MDN. The source HTML remains available as escaped text. A missing table does not imply a build failure: deprecated properties, orphaned pages, and macro lookup errors can all produce this outcome. Diagnostics are shown separately.

Only formal definition tables are compared. Other page changes between main and the PR branch are outside this report. Identical changes are grouped within a locale, so translations are never conflated. Group counts follow the active page filters.

## Dependency snapshot

`inputs/pins.json` records source commits, dependency versions, Rust version, locale scope, and the archive checksum. The archive contains separate main and PR cache directories. Both use the same raw package versions, including WebRef CSS 8.7.4 and mdn-data 2.35.0. The PR's transformed WebRef JSON was regenerated from that frozen raw package using its own `rari_deps::webref_css::update_webref_css` function. This is necessary because the old transform drops fields introduced by the PR.

The archive is included so reproduction does not resolve new npm releases or fetch changing popularity and developer-signal data. It contains public data and upstream package license files. Dependency check timestamps are fixed in the snapshot; updates are disabled for both builds.

## Publish

The GitHub Pages workflow publishes the committed `site/` directory on pushes to main. Configure the repository's Pages source as GitHub Actions. Publishing does not require rebuilding rari. See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Attribution

The generated comparison adapts MDN documentation by Mozilla contributors under [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/). Each page includes links to its pinned source and contributor history. The report changes the presentation, extracts formal definition tables, and adds comparisons. Dependency data retains its upstream licenses, included with the snapshot's packages. See [MDN content](https://github.com/mdn/content), [translated-content](https://github.com/mdn/translated-content), [mdn-data](https://github.com/mdn/data), and [WebRef](https://github.com/w3c/webref).
