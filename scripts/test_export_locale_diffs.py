import unittest

from export_locale_diffs import diagnostic_key, fenced, report_for_locale


class ExportTests(unittest.TestCase):
    def test_diagnostic_identity_ignores_position_but_preserves_fields(self):
        cases = [
            {'name': 'moved diagnostic', 'a': {'line': 1, 'fields': [['message', 'missing']]}, 'b': {'line': 9, 'fields': [['message', 'missing']]}, 'same': True},
            {'name': 'changed message', 'a': {'fields': [['message', 'missing']]}, 'b': {'fields': [['message', 'different']]}, 'same': False},
            {'name': 'field ordering', 'a': {'fields': [['source', 'macro'], ['message', 'missing']]}, 'b': {'fields': [['message', 'missing'], ['source', 'macro']]}, 'same': True},
        ]
        for case in cases:
            with self.subTest(case['name']):
                self.assertEqual(diagnostic_key(case['a']) == diagnostic_key(case['b']), case['same'])

    def test_groups_identical_diffs_without_dropping_unchanged_pages(self):
        pages = [{'id': str(n), 'locale': 'fr', 'url': f'/fr/docs/{n}', 'slug': str(n), 'source': f'translated-content/files/fr/{n}/index.md', 'status': 'changed' if n < 3 else 'unchanged'} for n in (1, 2, 3)]
        issue = {'line': 1, 'fields': [['message', 'missing']]}
        details = {str(n): {'diff': '-old\n+new' if n < 3 else '', 'before': {'tables': ['old']}, 'after': {'tables': ['new']}, 'diagnostics': {'main': [issue], 'pr': [{**issue, 'line': 99}]}} for n in (1, 2, 3)}
        index = {'manifest': {'pins': {'snapshotDate': '2026-09-16', 'packages': {'@webref/css': '8.7.4', 'mdn-data': '2.35.0'}, 'revisions': {'translated-content': 'abc'}}}}
        report, meta = report_for_locale('fr', pages, details, index, 'sha')
        self.assertEqual(meta['pages'], 3)
        self.assertEqual(meta['diffGroups'], 1)
        self.assertIn('Pages: P001, P002.', report)
        self.assertIn('| P003 |', report)
        self.assertEqual(report.count(fenced('-old\n+new', 'diff')), 1)
        self.assertIn('New or increased occurrences (0 pages): none.', report)
        self.assertIn('Resolved or decreased occurrences (0 pages): none.', report)

    def test_evidence_with_backticks_cannot_close_its_fence(self):
        self.assertEqual(fenced('```\nvalue', 'diff'), '````diff\n```\nvalue\n````')


if __name__ == '__main__':
    unittest.main()
