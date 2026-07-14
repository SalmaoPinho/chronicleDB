# Story & Notebook Formatting Guide

This guide explains how to format story files, field notes, and notebook entries to take full advantage of the Character Manager's interactive rendering system (e.g., sound bubbles, dialogue portraits, and action blocks).

## Core Concepts

The system uses a custom Markdown parser that detects specific line patterns and block macros. These features are primarily used in the "Field Notes" and "Notebook" views within the Master Reference.

---

## 1. Dialogue Bubbles

Dialogue is automatically rendered with character portraits and distinct speech bubbles.

### Standard Dialogue
Use the `Speaker: Text` format on a new line.
```markdown
Lina: I think we should check the north sector.
Clint: Agreed. Let's move.
```
*   **Portraits**: The system resolves the speaker's name to a character ID to display the correct portrait.
*   **Time-Sync**: Portraits are automatically chosen based on the year of the entry or notebook.

---

## 2. Action & Sound Bubbles

These bubbles are styled differently to represent actions or environmental sounds.

### Action Bubbles (with Portrait)
Use `[Actor] - Action` to show a character performing an action.
```markdown
[Lina] - runs a thumb over the edge of the pages.
```
*   **Multi-Portrait**: If the action text mentions another character, the system will often show a "target" portrait next to the actor.

### Action Bubbles (without Portrait)
Use a single `*` for an generic action bubble.
```markdown
* The hum of the refrigerator fills the room.
```

### Sound Bubbles (Interactive SFX)
Use `!` to trigger a sound bubble.
```markdown
! low, rhythmic thud of a heavy bag.
```
*   **SFX Playback**: If the text contains a mapped keyword (e.g., `thud`, `punch`, `rain`), the "Read Page" tool will play the corresponding audio file.

---

## 3. Specialized Layout Blocks

Use HTML-like comment blocks for complex UI components.

### Observation Box
Used for clinical or detailed data points.
```markdown
<!-- block: obs-box { "label": "DATA POINT", "speaker": "Lina" } -->
Consistency is a value I have documented as being primary to my psychological equilibrium.
<!-- endblock -->
```

### Rant Box
Used for messy, emotional, or handwritten notes.
```markdown
<!-- block: rant-box { "label": "IMPORTANT", "speaker": "Clint" } -->
This is getting out of hand!
<!-- endblock -->
```

### Sticky Note
Used for quick, temporary-looking annotations.
```markdown
<!-- block: sticky { "speaker": "Lina" } -->
Remember to check the fuel levels.
<!-- endblock -->
```

---

## 4. Media & Layout

### Image Embeds
Embed images with captions.
```markdown
*(img: portraits/lina/lina-2026.png)*
*(imgnotes: Lina during the 2026 expedition.)*
```

### Scene Dividers
Use three asterisks on a line by themselves to add a stylized visual break.
```markdown
***
```

---

## 5. Tips for AI Authors

1.  **Be Precise with Names**: Use names that match the character registry (e.g., use "Lina" instead of "Lina-san") to ensure portraits load correctly.
2.  **One Action Per Line**: Keep action bubbles and sound triggers on their own lines for the best visual spacing.
3.  **Mix Formats**: Combine dialogue, actions, and observations to create a "found document" aesthetic.
4.  **Keyword Usage**: When using `!`, include clear keywords like `click`, `gunshot`, `door`, or `walk` to trigger the SFX system.

---

## Troubleshooting

*   **Portrait Missing**: Check if the name in `Speaker:` matches the character's name in `entities.json`.
*   **Sound Not Playing**: Ensure the word used after `!` is in the `NOTEBOOK_SFX_MAP` or matches a filename in `sfx/sort/`.
*   **Layout Broken**: Ensure all `<!-- block -->` tags have a corresponding `<!-- endblock -->`.
