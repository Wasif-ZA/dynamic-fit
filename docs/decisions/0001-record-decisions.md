# ADR-0001: Keep a decision log

- **Status:** accepted
- **Date:** 2026-08-05

## Context

Six people, thirteen weeks, one repo. Design questions get settled in a workshop, in a group chat,
or in one person's head, and then get re-argued a fortnight later because nobody can remember what
we decided or why.

There is also a marking reason. The Individual Reflective Report is 40% of this unit and has to
explicitly refer to artefacts. None of it is reconstructable in November from memory.

## Decision

Keep short numbered decision records in `docs/decisions/`. One per decision that was genuinely
contested or that a newcomer would otherwise question.

A record is worth writing when someone would reasonably ask "why is it like that?" It is not worth
writing for things that are obvious from the code.

## Consequences

- Settled questions stay settled, and reopening one means writing a superseding record rather than
  quietly changing course.
- Everyone gets dated evidence of decisions they argued for, which is what the reflective report
  needs.
- Small ongoing cost: about ten minutes per record, and someone has to notice a decision is being
  made.
