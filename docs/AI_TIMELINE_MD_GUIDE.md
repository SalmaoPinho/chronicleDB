# AI Timeline Markdown Guide

This guide describes the modular Markdown-based timeline entry format used in the Character Manager. For the staging and injection workflow, see [AI_TIMELINE_INJECT_GUIDE.md](AI_TIMELINE_INJECT_GUIDE.md).

## File Structure

- **Intake file**: `stories/<story_name>/newtimeline.md`
- **Storage**: The injection workflow sorts entries into the appropriate files under `stories/<story_name>/timeline/`.
- **Organization**: Entries within files are separated by `<!-- entry-break -->`. Each entry contains a YAML frontmatter block followed by a Markdown description.

## Entry Structure

Each timeline entry must follow this format:

```markdown
---
date: "YYYY-MM-DD"
title: "Event Title"
tags: ["tag1", "tag2"]
---
Event description goes here. You can use standard Markdown for formatting.
Multi-line descriptions are supported.

<!-- entry-break -->
```

### Frontmatter Fields

| Field | Required | Description |
| :--- | :--- | :--- |
| `date` | Yes | The date of the event in exact `YYYY-MM-DD` format. Do not leave the month or day as `00`; fill in the complete date before adding the entry. |
| `title` | Yes | A concise title for the event. |
| `tags` | No | An array of strings representing categories or associations (e.g., `["faction-name", "key-event"]`). For character tags, use the character's first name only and omit any `the-` slug prefix. |
| `id` | No | An optional unique identifier. If missing, the system uses date + title for targeting. |

## Content Blocks

The description area supports the same block macros as character biographies:

- `*(img: path/to/image.jpg)*`: Embeds an image.
- `*(imgnotes: Caption text)*`: Adds a subtitle/caption below the previous image.
- `<!-- block: type {meta} -->`: Reserved for specialized interactive blocks (e.g., `field-note`).

## Editing Guidance

1. **Focus on Actions**: Timeline entries should focus on "what happened"—external actions, key decisions, and concrete occurrences. While emotional context is valuable, the primary goal is to document the sequence of history.
2. **Daily Granularity**: Each distinct day should have its own entry. Do not group unrelated events from different days into a single timeline entry. 
3. **Continuous Events**: For events spanning multiple days (e.g., "The Battle of Greenfield"), use a single entry with the start date and describe the duration in the text, or use multiple entries if key distinct events happened on specific days within that span.
4. **Date Format**: Always use exact `YYYY-MM-DD`. Do not use `00` for missing month or day values.
5. **Avoid Duplicates**: Before adding an event, check if it already exists in the source timeline content to maintain chronological integrity.
6. **Markdown Usage**: Use Markdown for emphasis, lists, and links within the description to keep the timeline visually rich.

## Relationship Integration

Some timeline events are "synthetic" results of relationship data (e.g., weddings, breakups). Do not manually add these to the timeline files if they are already defined in the relationship registry; the system reconciles them automatically.
