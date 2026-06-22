# Morning Tee Brain

Morning Tee Brain is a local prep system for drafting Morning Tee newsletters faster without turning the workflow into autopilot. It preserves the voice, structure, editorial rules, golf-analysis standards, source discipline, sponsor tone, and production checklist that should guide future issues.

It can help draft:
- Monday and Thursday Beehiiv-ready newsletter drafts.
- Today in Golf blurbs for human review.
- Story angles, preview bullets, section outlines, sponsor reads, and final checklists.
- Local Markdown drafts that a human can edit before manually moving copy into Beehiiv.

It must never:
- Publish, send, schedule, or create Beehiiv campaigns.
- Access subscriber data or Beehiiv settings.
- Treat old Morning Tee examples as current facts.
- Invent news, quotes, stats, rankings, field lists, tee times, injuries, or rulings.
- Commit secrets, cookies, tokens, API keys, or private subscriber information.

Human approval rule: every issue must be reviewed by a person before anything is pasted into Beehiiv or sent. Morning Tee Brain is a drafting assistant, not a publishing system.

## Suggested Workflow

1. Pick the issue type: Monday, Thursday, or Today in Golf.
2. Gather current sources and source notes. Use `source-rules.md` before drafting.
3. Rank candidate stories with `story-selection-rules.md`.
4. Draft with `newsletter-template.md`.
5. Tighten voice with `style-guide.md` and section structure with `recurring-sections.md`.
6. Review golf reasoning with `golf-analysis-rules.md`.
7. Use `workflows/issue-production-checklist.md` before any human moves copy into Beehiiv.

For a blank local draft:

```powershell
node scripts\create-morning-tee-draft.js
```

The draft is created in `morning-tee-brain/drafts/` and is clearly marked as local, unpublished prep copy.
