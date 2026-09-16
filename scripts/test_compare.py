import unittest

from compare import compare_rows, extract


def document(html):
    return {'body': [{'type': 'prose', 'value': {'content': html}}]}


class CompareTests(unittest.TestCase):
    def test_extracts_only_definition_tables(self):
        cases = [
            {'name': 'ignores unrelated tables', 'html': '<table><tr><th>X</th><td>Y</td></tr></table>', 'expected': []},
            {'name': 'decodes entities and normalizes spaces', 'html': '<table class="properties"><tr><th>Initial</th><td>a &amp;\n b</td></tr></table>', 'expected': [('Initial', 'a & b')]},
            {'name': 'keeps nested list boundaries', 'html': '<table class="other properties"><tr><th>Value</th><td><ul><li>a</li><li>b</li></ul></td></tr></table>', 'expected': [('Value', 'a b')]},
            {'name': 'keeps nested tables inside a value', 'html': '<table class="properties"><tr><th>Value</th><td><table><tr><td>nested</td></tr></table></td></tr></table>', 'expected': [('Value', 'nested')]},
        ]
        for case in cases:
            with self.subTest(case['name']):
                actual = extract(document(case['html']))
                self.assertEqual([(r['label'], r['text']) for r in actual['rows']], case['expected'])

    def test_classifies_row_changes(self):
        def rows(value):
            if value is None:
                return []
            return extract(document(f'<table class="properties"><tr><th>Initial</th><td>{value}</td></tr></table>'))['rows']
        cases = [
            {'name': 'unchanged', 'a': 'auto', 'b': 'auto', 'expected': 'unchanged'},
            {'name': 'text change', 'a': 'auto', 'b': 'none', 'expected': 'text'},
            {'name': 'markup only', 'a': '<code>auto</code>', 'b': 'auto', 'expected': 'markup'},
            {'name': 'link target change', 'a': '<a href="/a">auto</a>', 'b': '<a href="/b">auto</a>', 'expected': 'markup'},
            {'name': 'added', 'a': None, 'b': 'auto', 'expected': 'added'},
            {'name': 'removed', 'a': 'auto', 'b': None, 'expected': 'removed'},
        ]
        for case in cases:
            with self.subTest(case['name']):
                self.assertEqual(compare_rows(rows(case['a']), rows(case['b']))[0]['kind'], case['expected'])

    def test_duplicate_labels_and_multiple_tables_do_not_overwrite_rows(self):
        table = '<table class="properties"><tr><th>Value</th><td>a</td></tr><tr><th>Value</th><td>b</td></tr></table>'
        rows = extract(document(table + table))['rows']
        self.assertEqual([r['key'] for r in rows], ['0:Value:1', '0:Value:2', '1:Value:1', '1:Value:2'])
        self.assertEqual(len(compare_rows(rows, rows)), 4)


if __name__ == '__main__':
    unittest.main()
