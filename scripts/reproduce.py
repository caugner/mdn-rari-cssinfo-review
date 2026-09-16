#!/usr/bin/env python3
"""Rebuild the review site from pinned Git revisions and dependency data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

from compare import ROOT, generate, load_build, extract, write_json


def run(args, **kwargs):
    print('+', ' '.join(map(str, args)), flush=True)
    return subprocess.run(list(map(str, args)), check=True, **kwargs)


def checkout(repo, revision, work, local=None):
    bare = work / 'repos' / f'{repo}.git'
    bare.parent.mkdir(parents=True, exist_ok=True)
    if not bare.exists():
        if local:
            run(['git', 'clone', '--bare', '--shared', local, bare])
        else:
            run(['git', 'init', '--bare', bare])
    available = subprocess.run(['git', '-C', str(bare), 'cat-file', '-e', f'{revision}^{{commit}}'], capture_output=True).returncode == 0
    if not available:
        run(['git', '-C', bare, 'fetch', '--depth=1', f'https://github.com/mdn/{repo}.git', revision])
    dest = work / 'worktrees' / repo / revision[:12]
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        run(['git', '-C', bare, 'worktree', 'add', '--detach', dest, revision])
    actual = subprocess.check_output(['git', '-C', str(dest), 'rev-parse', 'HEAD'], text=True).strip()
    dirty = subprocess.check_output(['git', '-C', str(dest), 'status', '--porcelain', '--untracked-files=no'], text=True)
    if actual != revision or dirty:
        raise RuntimeError(f'Expected a clean checkout at {revision}: {dest}')
    return dest


def digest_tree(path):
    return {str(f.relative_to(path)): hashlib.sha256(f.read_bytes()).hexdigest()
            for f in sorted(path.rglob('*.json'))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, default=Path(tempfile.gettempdir()) / 'rari-cssinfo-reproduce')
    parser.add_argument('--out', type=Path, default=ROOT / 'site')
    parser.add_argument('--local-repos', type=Path, help='Optional directory containing existing rari, content, and translated-content clones')
    parser.add_argument('--binary-dir', type=Path, help='Reuse main/pr binaries with binaries.json revision and checksum metadata')
    parser.add_argument('--verify', action='store_true', help='Fail if regenerated data differs from the checked-in site')
    args = parser.parse_args()
    work = args.work_dir.resolve()
    if work == ROOT or ROOT in work.parents:
        parser.error('--work-dir must be outside this repository')
    pins = json.loads((ROOT / 'inputs/pins.json').read_text())
    archive = ROOT / 'inputs/dependencies.tar.gz'
    if hashlib.sha256(archive.read_bytes()).hexdigest() != pins['dependencyArchiveSha256']:
        raise RuntimeError('Dependency archive checksum mismatch')
    expected = digest_tree(ROOT / 'site/data') if args.verify else None
    if args.verify and not expected:
        raise RuntimeError('No checked-in data to verify against')
    revisions = pins['revisions']
    sources = {}
    for name, revision in revisions.items():
        repo = 'rari' if name.startswith('rari-') else name
        sources[name] = checkout(repo, revision, work, args.local_repos / repo if args.local_repos else None)
    deps = work / 'deps'
    if deps.exists():
        shutil.rmtree(deps)
    deps.mkdir(parents=True)
    with tarfile.open(archive) as tar:
        tar.extractall(deps, filter='data')
    binaries = work / 'bin'
    binaries.mkdir(exist_ok=True)
    binary_meta = {}
    for side in ('main', 'pr'):
        revision = revisions[f'rari-{side}']
        binary = binaries / side
        if args.binary_dir:
            source = args.binary_dir.resolve() / side
            meta = json.loads((args.binary_dir / 'binaries.json').read_text())[side]
            if meta['revision'] != revision or meta['sha256'] != hashlib.sha256(source.read_bytes()).hexdigest():
                raise RuntimeError(f'Binary provenance mismatch: {side}')
            if source != binary:
                shutil.copyfile(source, binary)
                binary.chmod(0o755)
        else:
            target = work / 'target' / side
            env = {**os.environ, 'CARGO_TARGET_DIR': str(target)}
            run(['cargo', f"+{pins['rust']}", 'build', '--locked', '--bin', 'rari'], cwd=sources[f'rari-{side}'], env=env)
            shutil.copyfile(target / 'debug/rari', binary)
            binary.chmod(0o755)
        binary_meta[side] = {'revision': revision, 'sha256': hashlib.sha256(binary.read_bytes()).hexdigest()}
        output = work / 'build' / side
        if output.exists():
            shutil.rmtree(output)
        # Run outside checkouts so local .config.toml files cannot affect the build.
        env = {k:v for k,v in os.environ.items() if k.upper() not in {
            'CONTENT_ROOT', 'CONTENT_TRANSLATED_ROOT', 'BUILD_OUT_ROOT', 'DEPS_DATA_DIR',
            'BLOG_ROOT', 'GENERIC_CONTENT_ROOT', 'CURRICULUM_ROOT', 'CONTRIBUTOR_SPOTLIGHT_ROOT',
            'DENY_WARNINGS', 'CACHE_CONTENT', 'DATA_ISSUES', 'JSON_ISSUES',
            'ADDITIONAL_LOCALES_FOR_GENERICS_AND_SPAS'}}
        env.update(CONTENT_ROOT=str(sources['content'] / 'files'),
                   CONTENT_TRANSLATED_ROOT=str(sources['translated-content'] / 'files'),
                   BUILD_OUT_ROOT=str(output), DEPS_DATA_DIR=str(deps / side),
                   CACHE_CONTENT='true', DENY_WARNINGS='false', DATA_ISSUES='false', JSON_ISSUES='false')
        config = work / 'isolated-config'
        config.mkdir(exist_ok=True)
        # Rari reads a platform-specific user config; explicit roots override it.
        env['XDG_CONFIG_HOME'] = str(config)
        command = [binary, '--skip-updates', 'build', '--grep', pins['grep'], '--locale', ','.join(pins['locales']), '--issues', work / f'{side}-issues.json']
        with (work / f'{side}.log').open('w') as log:
            run(command, cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT)
        compact = work / 'compact' / side
        if compact.exists():
            shutil.rmtree(compact)
        for url, doc in load_build(output).items():
            tables = extract(doc)['tables']
            write_json(compact / hashlib.sha256(url.encode()).hexdigest() / 'index.json',
                       {'url': url, 'doc': {'mdn_url': doc['mdn_url'], 'title': doc['title'],
                        'body': [{'type': 'prose', 'value': {'content': ''.join(tables)}}]}})
        shutil.rmtree(output)
        compact.rename(output)
    (binaries / 'binaries.json').write_text(json.dumps(binary_meta, indent=2) + '\n')
    generate(work, sources['content'] / 'files', sources['translated-content'] / 'files', args.out.resolve())
    if args.verify:
        actual = digest_tree(args.out / 'data')
        if actual != expected:
            differences = sorted(k for k in expected.keys() | actual.keys() if expected.get(k) != actual.get(k))
            raise RuntimeError(f'Reproduction differs in {len(differences)} files: {differences[:10]}')
        print(f'Verified: {len(actual)} data files reproduce byte for byte.')
    print(f'Site: {args.out.resolve()}')


if __name__ == '__main__':
    main()
