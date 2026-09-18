# CSSInfo cutover review prompt

Use this prompt to recreate the decision brief for the CSS formal-definition
cutover.

```text
Review the published CSSInfo comparison artifacts at:

https://caugner.github.io/mdn-rari-cssinfo-review/artifacts/

The purpose of the review is to inform the content team's decision about when
and how to switch CSS formal definitions from mdn-data to WebRef. The switch is
already planned. Focus on readiness, sequencing, and any risks that must be
addressed before the full cutover. Do not assume that a global cutover must
happen all at once. Evaluate an incremental migration in which WebRef is
enabled for some page types or metadata categories while other pages continue
using the existing source.

Base the review on the published artifacts, not on assumptions about the
implementation. Start with the artifact index and manifest, then inspect the
locale reports and representative page-level diffs. Use the current MDN pages
and the relevant standards as secondary evidence when deciding whether a
change is correct. Link to every artifact, MDN page, and specification used as
evidence.

## Questions to answer

1. What changed overall?
   - Count the locales and pages reviewed.
   - Count changed, added, removed, unchanged, and missing formal-definition
     tables.
   - Identify changes that are common across locales versus isolated to one
     locale or page type.

2. Which changes must be fixed before any cutover?
   Prioritize regressions that remove or materially weaken information,
   especially:
   - a longhand losing concrete values and becoming "see individual
     properties";
   - a custom-property or alias page losing its complete table;
   - a descriptor or legacy alias being removed without an equivalent;
   - applicability qualifiers being dropped, including pseudo-elements, SVG,
     and table-element restrictions;
   - localized labels or values unexpectedly falling back to English;
   - new diagnostics, macro failures, or lookup failures that would affect
     published pages.

   For each blocker, provide:
   - severity and scope;
   - affected locales and page counts;
   - one or more representative artifact links;
   - the expected behavior based on current MDN content or the governing
     specification;
   - a concrete remediation or a clearly stated reason that migration should
     be blocked.

3. Which changes are acceptable as-is, subject to an explicit policy decision?
   Separate likely improvements from changes that only look different because
   WebRef is more current. Consider:
   - values updated to match current specifications;
   - newly available property or descriptor tables;
   - removal of obsolete vendor-prefixed or orphaned entries;
   - improved or canonicalized specification links;
   - shorthand rows that intentionally summarize their longhands.

   Flag cases where the new value conflicts with current MDN prose or where a
   longhand is being treated like a shorthand. Do not call a change acceptable
   merely because it comes from a specification source.

4. What migration boundaries are practical?
   Classify page types and metadata categories into:
   - ready for WebRef now;
   - WebRef after a targeted fix;
   - keep on mdn-data until a fallback or content fix exists;
   - unsafe to migrate without localization or product-policy decisions.

   At minimum, evaluate standard en-US property pages, descriptor pages,
   custom-property pages, legacy aliases, vendor-prefixed or orphaned pages,
   translated pages, and pages with missing WebRef data.

5. What regression checks are needed before and after cutover?
   Recommend checks for table disappearance, longhand collapse, preservation of
   applicability qualifiers, alias coverage, localized labels and values,
   missing-data fallback, diagnostics, and changes in page counts.

## Required output

Write a concise Markdown decision brief with these sections:

1. Executive summary
2. Scope and evidence
3. Must-fix blockers
4. Acceptable changes and policy decisions
5. Incremental migration proposal
6. Required regression checks
7. Decision checklist

Use tables where they make scope or recommendations easier to compare. Include
exact counts and representative links, but avoid dumping every changed page.
Distinguish observed facts from interpretation. State uncertainty when the
artifacts do not establish whether a change is intentional.

End with a checklist that content and engineering can answer explicitly:

- Are the identified blockers fixed or explicitly waived?
- Which page types and metadata categories are enabled for WebRef?
- What remains on mdn-data, and what fallback behavior applies?
- Are translated locales included, excluded, or migrated selectively?
- Which current-spec changes are accepted ahead of MDN prose updates?
- Which regression checks are required for the cutover and for subsequent
  WebRef updates?
```
