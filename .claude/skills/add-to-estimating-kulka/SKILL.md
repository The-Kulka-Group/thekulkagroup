---
name: add-to-estimating-kulka
description: Automates Kulka new-lead estimating intake. When a drawing set or Dropbox/Box link arrives, reads the cover for project name and address, checks the next job number against Monday and OneDrive, creates the OneDrive project folder from template, and logs the job in Monday, ProEst, and/or BuildingConnected after an explicit go-ahead. Use when someone says set up a new job, add to estimating, or intake a new lead for Kulka.
---

# Add to estimating (Kulka)

Automates the new-lead intake ritual for Kulka Estimating.

## What it does

When a new construction lead comes in (drawing set attached, or a Dropbox/Box link):

1. Reads the cover sheet for project name and address
2. Verifies the next project number against both the Monday log and OneDrive folder names
3. Creates the OneDrive project folder from the template
4. Logs the job in Monday, ProEst, and/or BuildingConnected — whichever combination is needed for that lead

## Safeguards

- Checks for duplicates or a partially finished run before creating anything new
- Always shows every field it is about to write and waits for an explicit go-ahead before touching any system
- Stops to ask rather than guess on anything it cannot determine on its own (division letter, priority, estimate type, etc.)

## How to use

Describe the lead and what you want done. Examples:

- "set up a new job for this lead"
- "log this in Monday and ProEst"

The skill walks the checklist with you.

## Process map

- `process-map.html` — clickable HTML flow (companion to the PDF)
- `process-map.pdf` — one-page flowchart emailed to Kulka Sep 18, 2026
