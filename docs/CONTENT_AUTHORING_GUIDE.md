# Character Reference Authoring Guide

This project is data-driven.

- Layout and rendering logic live in `mr.html` and `scripts/mr/`.
- Theme differences are configured in `stories/<story_name>/year_themes.json` and applied through CSS variables in `styles/style.css` or year theme definitions.
- Custom storytelling contents live under `stories/<story_name>/` (e.g., `stories/<story_name>/core.json`, `stories/<story_name>/entities.json`).
- Chronological timeline events live under `stories/<story_name>/timeline/`.

## Theme Styles JSON

Use `stories/<story_name>/year_themes.json` to define what changes between sheet years.

- `themes.default.vars` is the fallback theme.
- `themes.<year>.vars` overrides variables for that year.
- Variables map directly to CSS custom properties used by the stylesheet.

Example:

```json
{
  "themes": {
    "2028": {
      "styleKey": "2028",
      "vars": {
        "--pin-color": "#00e5ff",
        "--font-body": "'Share Tech Mono', monospace",
        "--main-surface": "linear-gradient(180deg, #070c14 0%, #05080f 100%)"
      }
    }
  }
}
```

## Shared Character Core

Use `stories/<story_name>/core.json` for traits that should be defined once and reused across years.

- Key each character by entry `id`.
- Add a `rows` array using the table row shape (`label`, `value`).
- Core rows are merged into each entry's first table before rendering.
- If a core row label already exists in the entry table, core data overrides that row.
- Use `pinned: true` on a core row to force it to the top of the table.
- Use `pinned: false` on a core row to keep it in-place with normal rows (or append if missing).

Example:

```json
{
  "characters": {
    "alex": {
      "rows": [
        { "label": "full name", "value": "alex vance" },
        {
          "label": "birthday",
          "birthDate": "2007-03-15",
          "pinned": true,
          "valueTemplate": "{{birthdayLong}}. age {{age}}. senior year, spring {{year}}."
        }
      ]
    }
  }
}
```

## Entry Shape

Each item in `entries` is one page/section.

```json
{
  "id": "unique-id",
  "order": 10,
  "navGroup": "Main Cast",
  "navLabel": "Alex",
  "navTag": "optional small tag",
  "eyebrow": "Main Cast - Lead",
  "title": "Alex",
  "authorNote": "Optional short note under title",
  "blocks": []
}
```

## Required vs Optional Fields

- Required:
  - `id` (must be unique)
  - `order` (number used for sorting)
  - `navGroup` (sidebar section label)
  - `navLabel` (sidebar item text)
  - `title` (page title)
  - `blocks` (array)
- Optional:
  - `navTag` (small tag in sidebar)
  - `eyebrow`
  - `authorNote`

## Block Types

`blocks` controls what appears on each page.

### 1) Text block

```json
{
  "type": "text",
  "className": "char-intro",
  "body": "Paragraph content. HTML line breaks like <br> are allowed."
}
```

- `className` is optional. If omitted, renderer uses `char-intro`.

### 2) Table block

```json
{
  "type": "table",
  "rows": [
    { "label": "full name", "value": "alex vance" },
    { "label": "birthday", "value": "march 15, 2007" }
  ]
}
```

- Use this for most character details.
- `value` supports inline HTML (for example status tags).

Birthday rows can also be structured:

```json
{
  "label": "birthday",
  "birthDate": "2007-03-15",
  "valueTemplate": "{{birthdayLong}}. age {{age}}. senior year, spring {{year}}."
}
```

- `birthDate` is ISO (`YYYY-MM-DD`).
- `valueTemplate` tokens:
  - `{{age}}` computed from selected year
  - `{{year}}` active year
  - `{{birthdayLong}}` long formatted birthday (e.g., `march 15, 2007`)
  - `{{birthDate}}` raw ISO date
- If no template is present, existing text still works; the renderer replaces `age N` dynamically when possible.

### 3) Field Note block

```json
{
  "type": "field-note",
  "label": "Field Note",
  "body": "Short highlighted note."
}
```

### 4) Notes App block

```json
{
  "type": "notes-app",
  "label": "Notes App - Untitled",
  "body": "Dark card note text."
}
```

### 5) Section Break block

```json
{
  "type": "section-break",
  "label": "document structure"
}
```

### 6) Raw HTML block

Use this when you want to preserve a complex legacy section exactly as-is.

```json
{
  "type": "html",
  "body": "<div class=\"field-note\">...</div>"
}
```

- Keep this as a fallback when content is too custom for structured blocks.
- Prefer structured blocks (`table`, `field-note`, `notes-app`, `faction`) for normal authoring.

### 7) Faction block

Use this for faction cards with note text and member tags.

```json
{
  "type": "faction",
  "name": "The Resistance",
  "aka": "aka: defense force · local coalition",
  "note": "Faction summary text here.",
  "members": [
    { "text": "alex · center by gravity", "tier": "core" },
    { "text": "taylor · orbit", "tier": "member" }
  ]
}
```

- `tier` options: `core`, `member`, `orbit`.
- `core` and `orbit` use existing accent styles in the UI.

## Add a New Character

1. Open character sheets file in your story folder (e.g., `stories/<story_name>/core.json`).
2. Add a new object inside characters or entries registry.
3. Pick a unique `id` (lowercase, no spaces recommended).
4. Set `order` to place it where you want in the sidebar.
5. Set `navGroup` to an existing group (`Main Cast`, `Supporting Cast`) or a new one.
6. Add at least one block (usually a `table`).
7. Save and reload the page.

## Add a New Table to Existing Character

1. Find that character's entry.
2. Add a new block in `blocks`:

```json
{
  "type": "table",
  "rows": [
    { "label": "new field", "value": "new value" }
  ]
}
```

## Sidebar Behavior

- Sidebar is auto-generated from entries.
- Grouping is based on `navGroup`.
- Display order is based on ascending `order`.
- `navTag` appears as the small gray tag beside item text.

## Document Metadata

Top-level `meta` in `stories/<story_name>/metadata.json` controls header and browser title.

```json
"meta": {
  "documentTitle": "Field Notes - Spring 2026",
  "sidebarTitle": "Character Reference",
  "sidebarDoc": "Field Notes<br>Combined Edition",
  "sidebarMeta": "documented - spring 2026<br>updated: march 2026",
  "ageAsOf": "2026-03-01"
}
```

- `ageAsOf` is optional.
- When set, age calculations use that exact date.
- When omitted, the renderer defaults to March 1 of the selected year.

## Common Mistakes

- Duplicate `id` values.
- Missing comma between JSON objects.
- Using single quotes instead of double quotes in JSON.
- Forgetting to include `blocks` array.

## Local Preview

If JSON does not load and you see an error, open the project via a local server (for example Live Server in VS Code). Direct file opening can block `fetch` for local JSON in some browser setups.

## Character Pictures And Media

The page automatically tries to render character photos under each entry title.

- Story portrait folder: `stories/<story_name>/portraits/`
- Story pictures folder: `stories/<story_name>/pictures/`
- Per-year index file: `stories/<story_name>/pictures/<year>/image_index.json`

How matching works:

- The renderer matches files by character id/name from entries (for example `alex`).
- A portrait is matched first (for example `alex/base.jpg`).
- Media files in `stories/<story_name>/pictures/<year>/` are matched against faction/story names.
