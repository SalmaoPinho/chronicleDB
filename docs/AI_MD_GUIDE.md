# AI Character Markdown Guide

Purpose: A guide for Humans and AIs to generate structured character data in Markdown format. This format is designed to be human-readable, easily edited in VS Code, and machine-parseable for the character manager application.

## 1. File Structure

A single file can contain multiple character entries (e.g., all characters in a specific year or group). Entries are separated by a specific break tag.

```markdown
---
# YAML Frontmatter
id: "alex"
title: "Alex"
navGroup: "Resistance"
order: 1
---
Character content here...

<!-- entry-break -->

---
id: "taylor"
title: "Taylor"
---
Taylor's content...
```

## 2. YAML Frontmatter (Metadata)

Each entry must start with a `---` delimited YAML block.

| Key | Type | Description |
| :--- | :--- | :--- |
| `id` | String | **Required.** Unique lowercase hyphenated identifier. |
| `title` | String | Display name of the character. |
| `navGroup` | String | Group name for navigation clustering. |
| `order` | Number | Priority in the list (ascending). |
| `authorNote` | String | Optional meta-commentary or developer note. |
| `version` | String | Optional version label (e.g., "Alt Timeline"). |
| `tags` | Array | List of strings for filtering. |

## 3. Content Blocks

Content is organized into blocks using HTML comment markers.

### Text Blocks
Used for introductory text or general notes.
```markdown
<!-- block: text {"className":"char-intro"} -->
This is the character's primary intro text. It supports basic Markdown formatting.
```

### Table Blocks (Outfits/Gear)
Used for structured data like outfits, equipment, or stats.
```markdown
<!-- block: table {"id":"main-outfit"} -->
## default outfit
The character wears a tactical jacket.
*(img: stories/my-story/pictures/2026/alex/base.jpg)*
*(imgnotes: standard appearance)*
```

### Notes App / Field Notes
Used for personal notes or specific data fields.
```markdown
<!-- block: notes-app {"label":"Personal Diary"} -->
Dear diary, today was a long day.

<!-- block: field-note {"label":"Quirk"} -->
Only drinks room-temperature coffee.
```

## 4. Special Macro Syntax

The parser and backend look for these specific patterns within blocks (especially table blocks):

- `*(img: path/to/image.jpg)*`: Primary image for the row.
- `*(unmasked: path)*`: Secondary/Unmasked variant image.
- `*(exposed: path)*`: Tertiary/Exposed variant image.
- `*(imgnotes: text)*`: Subtitle or note for the image.

## 5. Best Practices for AIs

- **Valid YAML**: Ensure the frontmatter is valid YAML. Avoid special characters in `id`.
- **Unique IDs**: Use `id: "char-name"` (lowercase, no spaces).
- **Entry Breaks**: Use `<!-- entry-break -->` to separate different characters.
- **Block Formatting**: Keep the `<!-- block: type {meta} -->` on its own line.
- **Intro Text**: Any text appearing before the first `block` marker will be captured as an automatic `text` block.

## 6. Where to Save

Save new character stories in the appropriate folder under your active story folder (e.g., `stories/<story_name>/timeline/`).

---
*End of AI Markdown Guide*
