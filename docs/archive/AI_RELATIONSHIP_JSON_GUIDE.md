% AI Relationship JSON Guide

Purpose: teach AIs how to author relationship / relationship_events JSON for this repo.

Essential rules
- Relationship documents capture thematic groupings, ongoing relationships, and multi-person notes.
- Store these in `data/relationship_events.json` or a `data/relationships/` folder when many files are needed.
- No comments or trailing commas in final JSON.

Minimal relationship example

{
  "id": "shi-aftermath",
  "label": "The Shi After The Society — Where Each One Went",
  "type": "thematic-note",
  "startDate": "2025-10-01",
  "members": ["lotus","karen","swan","sultan"],
  "core-note": "Short summary preserving intent and tone.",
  "history": {
    "2025-10-01": ["society falls. the shi scatter."],
    "2025-10-08": ["saki confesses. ren is framed."]
  }
}

Recommended fields
- `id` (required): stable slug id for the relationship.
- `label` (required): human-readable title.
- `type` (recommended): classification such as `friendship`, `thematic-note`, `complicated`.
- `startDate` (recommended): ISO date `YYYY-MM-DD`.
- `members` (recommended): array of character `id`s.
- `core-note` (optional): concise summary.
- `history` (optional): object mapping ISO dates to arrays of short bullets describing events or changes.

Style guidance
- Use narrative short bullets in `history` to document changes over time.
- Keep `members` limited to ids; avoid embedding full character objects inside relationships.
- Use `type` to guide UI grouping and filtering.

Validation checklist
- JSON parses without error.
- `id` uses only lowercase letters, digits, and hyphens.
- `startDate` matches `^\d{4}-\d{2}-\d{2}$` when present.
- `members` is an array of valid character ids (where possible verify existence).

Cross-references
- For machine discoverability, ensure `members` values match character `id`s used in `data/characters/...` files.
- If an entry should be surfaced in a character file, include a reciprocal reference (e.g., add the relationship `id` to a character's `entries` or `authorNote`).

Best practices for AIs
- Produce minimal, readable `history` bullets — one sentence each.
- When uncertain about `members`, leave them out rather than guessing; add `source` with provenance instead.

If you want, I can generate a JSON Schema for relationship entries and a validator script.

End of relationship guide.
