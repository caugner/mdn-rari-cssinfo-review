# CSSInfo WebRef cutover review

Bottom line: I would not cut over globally as-is. WebRef brings real improvements, but this snapshot has several high-confidence blockers.

I reviewed the complete snapshot: 2,720 pages, 2,549 changed tables, 107 removed tables, and 51 added tables. The full reports are available from the [published artifacts index](https://caugner.github.io/mdn-rari-cssinfo-review/artifacts/).

## Fix before cutover

### 1. `animation-delay` is catastrophically degraded in 8 locales

All six formal-definition fields become `see individual properties`, including initial value, applies to, inherited, computed value, animation type, and percentages. Example: [en-US animation-delay](https://caugner.github.io/mdn-rari-cssinfo-review/#locale=en-us&status=all&doc=c3b76565fb6468de). Current MDN still defines its initial value as `0s`, with concrete applicability and computed-value data. [MDN animation-delay](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-delay)

### 2. Custom properties lose their entire formal table in every locale

The `--*` page goes from a useful table to no table at all. This is not acceptable for a mainstream page. [en-US custom properties](https://caugner.github.io/mdn-rari-cssinfo-review/#locale=en-us&status=all&doc=9b1b37530e8f85a2). Current MDN defines initial value, applicability, inheritance, computed value, and animation type. [MDN custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/--%2A)

### 3. The `font-stretch` descriptor table disappears

The new `font-width` table does not replace the existing `font-stretch` page, which is a legacy alias that must remain documented. [en-US font-stretch](https://caugner.github.io/mdn-rari-cssinfo-review/#locale=en-us&status=all&doc=1e8473a2c1d34c54). MDN and CSS Fonts 4 explicitly describe `font-stretch` as a retained alias. [MDN font-stretch](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40font-face/font-stretch), [CSS Fonts 4](https://www.w3.org/TR/css-fonts-4/)

### 4. Applicability qualifiers are frequently lost

Examples include:

- `animation-direction`: `all elements, ::before and ::after pseudo-elements` becomes `all elements`.
- `background` and `color`: `::first-letter` and `::first-line` qualifications disappear.
- Similar losses occur for table-element restrictions, SVG applicability, and pseudo-elements.

The en-US snapshot has 105 pages where applicability qualifiers are dropped. [animation-direction example](https://caugner.github.io/mdn-rari-cssinfo-review/#locale=en-us&status=all&doc=f12fb0b32fff1d26). Current MDN retains these qualifiers. [MDN animation-direction](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-direction), [MDN color](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color)

### 5. Localization fallback is too broad

Pages with observed English fallback, by locale:

| Locale | Pages |
| --- | ---: |
| ja | 486 / 580 |
| ru | 147 / 148 |
| zh-CN | 318 / 367 |
| fr | 192 / 596 |
| es | 64 / 191 |
| ko | 49 / 137 |
| pt-BR | 34 / 82 |
| zh-TW | 21 / 23 |

The PR also adds 262 missing-localization diagnostics on 195 en-US pages. zh-TW has a separate clear label regression: localized `適用於` and `動畫類型` are replaced by English `Applies to` and `Animation type` on 22 pages. [zh-TW example](https://caugner.github.io/mdn-rari-cssinfo-review/#locale=zh-tw&status=all&doc=f6fe2b33dabc9134)

## Likely acceptable, pending policy

- More current spec-derived values such as `@property inherits: true`, `font-style` descriptor initial value `auto`, and richer computed-value definitions.
- New tables for 51 properties or descriptors previously missing from `mdn-data`.
- Removal of obsolete vendor and orphaned properties, provided custom properties and aliases are special-cased.
- Link improvements and resolved redirected links.
- Replacing expanded shorthand explanations with `see individual properties`, but only for genuine shorthands. Longhands such as `animation-delay`, `border-left`, and `box-shadow` need review.

One important policy decision is whether WebRef is allowed to move formal definitions ahead of MDN prose. For example, WebRef changes `animation-duration` from `0s` to `auto`. CSS Animations 2 supports that change, but the current MDN page still says `0s`. [CSS Animations 2](https://www.w3.org/TR/css-animations-2), [MDN animation-duration](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-duration)

## Recommended migration shape

Use a fallback-based incremental migration:

1. Use WebRef for standard en-US property and descriptor pages after fixing the blockers above.
2. Keep `mdn-data` fallback for custom properties, legacy aliases, vendor/orphaned properties, and WebRef lookup failures.
3. Keep translated locales on the existing source until their WebRef strings are localized, or enable WebRef only for rows whose localized value is available.
4. Add regression checks for:
   - no table disappearing from `--*` or alias pages;
   - no `see individual properties` on longhands;
   - preservation of pseudo-element, SVG, and table qualifiers;
   - no unexpected English fallback in translated tables;
   - no new macro diagnostics without an explicit allowlist.

The key discussion is not "WebRef or mdn-data" globally. It is which metadata categories and page classes are authoritative enough to migrate now, and which need fallback until content and localization catch up.
