# AI Timeline Inject Guide

Purpose: Use this guide when preparing timeline entries for injection into the modular timeline system.

## Where to Put New Entries

Write new timeline entries in `stories/<story_name>/newtimeline.md`. Do not split new work across decade files or edit the generated timeline files directly unless you are fixing an existing record.

## Injection Workflow

After adding entries to `stories/<story_name>/newtimeline.md`, run the root launcher `timeline_pipeline.bat` (Windows) or `timeline_pipeline.sh` (Unix).

The pipeline does the following:

1. Injects the staged entries into the timeline system.
2. Formats timeline and relationship tags.
3. Sorts the timeline entries into their final location.

## Date and Tag Rules

- Use exact `YYYY-MM-DD` dates.
- Do not use `00` for missing month or day values.
- For character tags, use the character's first name only.
- Do not include the `the-` slug prefix in character tags.

## Practical Rule

If you are generating or editing timeline content as an AI, the default action is:

1. Put the new entry in `stories/<story_name>/newtimeline.md`.
2. Run the root launcher `timeline_pipeline.bat` (or shell equivalent).
