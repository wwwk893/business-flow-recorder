# Replay Contracts and Bug Patterns

Load this reference when changing recorder/replay behavior, locator generation,
terminal assertions, or BusinessFlow projection in `business-flow-recorder`.

## Layer Ownership

| Layer | Owns | Avoid |
| --- | --- | --- |
| `capture/` | raw recorder/page context facts | FlowStep projection |
| `interactions/` | input/select/click transactions | Playwright source rendering |
| `flow/` | BusinessFlow projection, finalization, redaction | runtime bridge |
| `uiSemantics/` | AntD/ProComponents/business semantic context and recipes | final code emission |
| `replay/` | exported/parser-safe code from step + recipe | new business inference |
| `src/server/recorder/` | upstream recorder/player plus narrow bridge | business semantics or healing |

## Non-Widening Locator Identity

Recorded identity evidence must not be weakened by replay codegen.

Preserve or regenerate equivalent strength for:

- `page.getByRole('button', { name: 'Create', exact: true })`
- `internal:role=button[name="Create"s]`
- duplicate locator hints with `pageIndex/pageCount`
- dialog/section/table/semantic ancestor scope

Do not replace exact/disambiguated evidence with:

```ts
page.getByRole("button", { name: "Create" })
```

If stronger structured scope exists, prefer scoped exact over global exact.

## ProComponents Input Identity

The fill value and field identity have different sources:

```text
value: recorder fill action or final input event
identity: page-context focus/input evidence
```

Rules:

- Keep range start/end independent even when they share a wrapper test id.
- Use wrapper test id + `fieldName` / placeholder / label as composite field
  identity.
- Preserve top-level `raw.pageContext` when merging input target evidence.
- Do not classify every `*-field` test id as a wrapper. Require page-context or
  form evidence, or treat the actual input test id directly.
- Do not parse `internal:role=textbox[name="..."]` as a DOM `name`.

Regression strings worth asserting:

```text
getByLabel("开始地址，例如：")
internal:label="开始地址，例如："
```

These should not appear when stronger wrapper + placeholder evidence exists.

## AntD Select / TreeSelect / Cascader

AntD popup replay is valid only when there is AntD/ProComponents popup evidence:

- recipe framework/component says Select, TreeSelect, or Cascader;
- target/control type indicates select-option/tree/cascader option;
- page context shows a dropdown/popup;
- source/runtime fallback is the active AntD popup option bridge.

Native `<select>` must keep `.selectOption(...)`. Do not route it through active
popup dispatch.

Readonly AntD search inputs are not fill targets. For parser-safe replay, open
the owning trigger, then click/dispatch the active popup option through the
declared bridge.

Contextless option clicks may inherit the previous select field only when:

- the preceding trigger/search belongs to an active dropdown;
- option text/title can be recovered;
- the event is not a checkbox/radio/text click after a select;
- generic ARIA options without AntD evidence stay generic.

## Row Actions and Deletion

Row-scoped actions need stable row identity:

- table test id/title;
- row key or row text identity;
- row action test id or role/name;
- popconfirm/dialog after-state when relevant.

Do not emit `row-not-exists` for a delete opener that only opens Popconfirm.
Generate disappearance assertions only for commit evidence:

- explicit confirm step;
- synthesized confirm in the same replay source;
- after-state proving the row disappeared after commit.

## Duplicate Test IDs and Semantic Ancestors

When a target test id repeats across devices/sections/business regions, prefer
nearest stable semantic ancestor scope:

```text
ancestor test id + allowlisted data-* attributes + target test id
```

Promote existing `global-testid` hints to `ancestor-scoped-testid` when
duplicate ancestor evidence arrives. Sanitize ancestor attributes consistently
in `context.before.ancestor` and `target.scope.ancestor`.

Fallback to global nth only when no better contextual evidence exists.

## Terminal Assertions

Generated replay must verify terminal business state:

- row exists after create;
- row not exists after confirmed delete;
- modal/drawer/popconfirm closed after commit;
- selected value visible after select;
- repeat rows appear with dynamic row keywords;
- required validation is visible when expected.

Assertions are hard checks. Be conservative: low-confidence inferred table ids
or guessed row identity should stay diagnostic, not enabled terminal truth.

## Overlay Prediction Diagnostics

Overlay prediction is shadow diagnostics unless a later task explicitly changes
the contract.

Keep diagnostics accurate:

- merge same-id page-context updates in the event journal;
- let same-id richer updates enter side-panel ingestion;
- wait for pending overlay prediction during stop/export settle;
- dedupe nested AntD overlay roots, e.g. `.ant-select-dropdown` containing
  `[role=listbox]`.

Do not let shadow predictions drive selector choice, FlowStep projection,
terminal assertions, parser-safe runtime, or exported replay unless the PR
scope explicitly says so.
