#!/usr/bin/env python3
"""Extract formal-definition tables and generate a static review dataset."""
import argparse
from collections import Counter
import difflib
import hashlib
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n')


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.tables = []
        self.depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            if self.depth or 'properties' in dict(attrs).get('class', '').split():
                self.depth += 1
        if self.depth:
            self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if self.depth:
            self.parts.append(f'</{tag}>')
            if tag == 'table':
                self.depth -= 1
                if not self.depth:
                    self.tables.append(''.join(self.parts))
                    self.parts = []

    def handle_data(self, data):
        if self.depth:
            self.parts.append(data)

    def handle_entityref(self, name):
        self.handle_data(f'&{name};')

    def handle_charref(self, name):
        self.handle_data(f'&#{name};')


class Rows(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.row = None
        self.cell = None
        self.text = []
        self.parts = []
        self.table_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.table_depth += 1
        if tag == 'tr' and self.table_depth == 1:
            self.row = []
        elif tag in ('th', 'td') and self.table_depth == 1 and self.cell is None:
            self.cell = tag
            self.text, self.parts = [], []
        elif self.cell:
            self.parts.append(self.get_starttag_text())
            if tag in ('br', 'li', 'p'):
                self.text.append(' ')

    def handle_endtag(self, tag):
        if tag == self.cell and self.table_depth == 1:
            self.row.append({'text': ' '.join(''.join(self.text).split()), 'html': ''.join(self.parts)})
            self.cell = None
        elif tag == 'tr' and self.table_depth == 1:
            if self.row and len(self.row) >= 2:
                self.rows.append({'label': self.row[0]['text'], **self.row[1]})
            self.row = None
        elif self.cell:
            self.parts.append(f'</{tag}>')
            if tag in ('li', 'p'):
                self.text.append(' ')
        if tag == 'table':
            self.table_depth -= 1

    def handle_data(self, data):
        if self.cell:
            self.text.append(data)
            self.parts.append(escape(data, quote=False))


def extract(doc):
    parser = Tables()
    for section in doc.get('body', []):
        if section.get('type') == 'prose':
            parser.feed(section['value']['content'])
    rows = []
    for number, table in enumerate(parser.tables):
        parser_rows = Rows()
        parser_rows.feed(table)
        counts = Counter()
        for row in parser_rows.rows:
            counts[row['label']] += 1
            row['key'] = f"{number}:{row['label']}:{counts[row['label']]}"
            rows.append(row)
    return {'tables': parser.tables, 'rows': rows}


def compare_rows(before, after):
    left = {r['key']: r for r in before}
    right = {r['key']: r for r in after}
    result = []
    for key in dict.fromkeys([*left, *right]):
        a, b = left.get(key), right.get(key)
        kind = ('added' if a is None else 'removed' if b is None else
                'text' if a['text'] != b['text'] else
                'markup' if a['html'] != b['html'] else 'unchanged')
        result.append({'label': (a or b)['label'], 'kind': kind, 'before': a, 'after': b})
    return result


def inventory(content, translated):
    result = {}
    for repo, root in [('content', content), ('translated-content', translated)]:
        for file in sorted(root.rglob('index.md')):
            rel = file.relative_to(root)
            locale = rel.parts[0]
            if locale == 'de':
                continue
            raw = file.read_text()
            if '{{cssinfo' not in raw.lower():
                continue
            slug = re.search(r'^slug:\s*[\'"]?(.+?)[\'"]?\s*$', raw, re.M)
            if not slug:
                raise ValueError(f'No slug: {rel}')
            url = f'/{locale}/docs/{slug[1]}'
            result[url.lower()] = {'url': url, 'locale': locale, 'slug': slug[1],
                                   'source': f'{repo}/files/{rel.as_posix()}'}
    return result


def load_build(root):
    result = {}
    for file in sorted(root.rglob('index.json')):
        value = json.loads(file.read_text())
        doc = value.get('doc')
        if doc and '/docs/' in doc.get('mdn_url', ''):
            result[value.get('url', doc['mdn_url']).lower()] = doc
    return result


def generate(run, content, translated, output):
    pins = json.loads((ROOT / 'inputs/pins.json').read_text())
    expected = inventory(content, translated)
    builds = {side: load_build(run / 'build' / side) for side in ('main', 'pr')}
    output.mkdir(parents=True, exist_ok=True)
    if (output / 'data').exists():
        shutil.rmtree(output / 'data')
    for file in (ROOT / 'web').iterdir():
        shutil.copyfile(file, output / file.name)
    diagnostics = {}
    for side in builds:
        entries = json.loads((run / f'{side}-issues.json').read_text())
        by_source = {}
        for file, issues in entries.items():
            path = Path(file)
            for repo, root in [('content', content), ('translated-content', translated)]:
                if path.is_relative_to(root):
                    source = f'{repo}/files/{path.relative_to(root).as_posix()}'
                    by_source[source] = sorted([
                        {'line': issue.get('line'), 'fields': issue.get('fields', [])}
                        for issue in issues if any(k == 'templ' and v.lower() == 'cssinfo'
                                                   for k, v in issue.get('spans', []))
                    ], key=lambda x: json.dumps(x, sort_keys=True))
        diagnostics[side] = by_source
    records, groups = [], {}
    for url, source in sorted(expected.items()):
        sides = {side: extract(builds[side][url]) if url in builds[side] else None for side in builds}
        before, after = sides['main'], sides['pr']
        rows = compare_rows((before or {}).get('rows', []), (after or {}).get('rows', []))
        kinds = sorted({r['kind'] for r in rows if r['kind'] != 'unchanged'})
        status = ('build-error' if before is None or after is None else
                  'missing-both' if not before['tables'] and not after['tables'] else
                  'table-added' if not before['tables'] else
                  'table-removed' if not after['tables'] else
                  'changed' if before['tables'] != after['tables'] else 'unchanged')
        if status == 'changed' and not kinds:
            kinds = ['markup']
        ident = hashlib.sha256(url.encode()).hexdigest()[:16]
        page_diagnostics = {side: diagnostics[side].get(source['source'], []) for side in builds}
        record = {**source, 'id': ident, 'title': (builds['pr'].get(url) or builds['main'].get(url) or {}).get('title', source['slug'].split('/')[-1]),
                  'diagnosticCount': sum(map(len, page_diagnostics.values())), 'status': status, 'kinds': kinds, 'fields': sorted({r['label'] for r in rows if r['kind'] != 'unchanged'}), 'groups': []}
        for row in rows:
            if row['kind'] == 'unchanged':
                continue
            key = json.dumps([source['locale'], row['label'], row['kind'],
                              (row['before'] or {}).get('html'), (row['after'] or {}).get('html')], ensure_ascii=False)
            gid = hashlib.sha256(key.encode()).hexdigest()[:16]
            record['groups'].append(gid)
            group = groups.setdefault(gid, {'id': gid, 'locale': source['locale'], 'label': row['label'], 'kind': row['kind'],
                                            'before': (row['before'] or {}).get('text'), 'after': (row['after'] or {}).get('text'), 'pages': []})
            if ident not in group['pages']:
                group['pages'].append(ident)
        diff = '\n'.join(difflib.unified_diff(
            re.sub(r'><', '>\n<', '\n'.join((before or {}).get('tables', []))).splitlines(),
            re.sub(r'><', '>\n<', '\n'.join((after or {}).get('tables', []))).splitlines(),
            fromfile='main', tofile='PR 912', lineterm=''))
        write_json(output / 'data/pages' / f'{ident}.json', {'before': before, 'after': after, 'rows': rows, 'diff': diff, 'diagnostics': page_diagnostics})
        records.append(record)
    unexpected = {side: sorted(set(built) - set(expected)) for side, built in builds.items()}
    if any(unexpected.values()):
        raise ValueError(f'Unexpected build pages: {unexpected}')
    manifest = {'pins': pins, 'count': len(records), 'status': dict(Counter(r['status'] for r in records)),
                'locales': dict(sorted(Counter(r['locale'] for r in records).items())),
                'builds': {side: {'pages': len(built), 'missing': sorted(set(expected) - set(built))} for side, built in builds.items()}}
    write_json(output / 'data/index.json', {'manifest': manifest, 'pages': records, 'groups': sorted(groups.values(), key=lambda g: (-len(g['pages']), g['id']))})
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--content', type=Path, required=True)
    parser.add_argument('--translated-content', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'site')
    args = parser.parse_args()
    generate(args.run, args.content, args.translated_content, args.out)
