# Relationship Markdown Guide (AI_RELATIONSHIPS_MD_GUIDE.md)

This guide details the structure and management of relationship data within the Character Manager Markdown-based system.

## File Organization
Relationships are stored in category-based Markdown files under `stories/<story_name>/relationships/`:

-   **`personal.md`**: Family, romance, and core personal ties.
-   **`operational.md`**: Professional, organizational, and mission-based ties.
-   **`historical.md`**: Arcs, incidents, and legacy historical pairings.
-   **`meta.md`**: Notes, complicated ties, and meta-data relationships.

## Canonical Type System
To maintain consistency, use the following **Canonical Types** when defining relationships:

| Category | Canonical Types |
| :--- | :--- |
| **Personal** | `family`, `romance`, `friendship`, `complicated`, `devotion` |
| **Operational** | `operation`, `organization`, `partnership` |
| **Historical** | `incident`, `arc`, `historical` |
| **Meta** | `note` |

## Entry Format
Each relationship entry consists of a **YAML Frontmatter** block followed by an optional description and a **History Block**. Entries are separated by `<!-- entry-break -->`.

### Basic Example
```markdown
---
id: "vance-family"
label: "Vance Family"
type: "family"
startDate: "1993-06-18"
members: ["robert", "linda"]
children: ["alex", "ashley"]
---
Core description of the family dynamics goes here.
```

### Detailed Example with History
```markdown
---
id: "vanguard-hero-anchor"
label: "Vanguard & Hero — The Anchor"
type: "romance"
startDate: "1995-06-15"
members: ["vanguard", "hero"]
---
Hero was Sarah's tether to humanity.

<!-- block: history -->
1995-06-15: Sarah flies out of Nova and catches Hero's falling plane.
2001-08-12: Hero is killed in action.
<!-- end-block -->

<!-- entry-break -->
```

## Field Definitions (Frontmatter)

-   **`id`** (Required): Unique slug for the relationship.
-   **`label`** (Required): Display name.
-   **`type`** (Required): One of the canonical types.
-   **`startDate`** (Optional): `YYYY-MM-DD` or `YYYY-MM` format.
-   **`splitDate`** (Optional): When the relationship ended or changed significantly.
-   **`members`**: Array of character IDs.
-   **`children`**: Array of character IDs representing offspring.
-   **`core-note`**: A high-level summary (alternative to the body text).

## Relationship-Specific Timeline (`history` block)
The `<!-- block: history -->` allows for fine-grained events specific to that pairing.
-   **Format**: `YYYY-MM-DD: Event description.`
-   **Synthetic Generation**: Events listed in this block are automatically aggregated by the backend and merged into the global character timelines.

## Best Practices
1.  **ID Consistency**: Ensure IDs match the slugs used in `core.json`.
2.  **Date Order**: While the backend sorts them, keeping entries chronologically ordered within the file is preferred for readability.
3.  **Cross-File Links**: You can reference other character IDs or relationship IDs in the body text using normal Markdown.
