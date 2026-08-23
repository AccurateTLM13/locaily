# Workspace Mobility Protocol

This repository uses `.localbrain/` as its persistent cross-machine work state.

## Session start

When the user says `Start session`, `continue`, `pick this up`, or otherwise resumes work:

1. Read `.localbrain/NOW.md`.
2. Read `.localbrain/DECISIONS.md`.
3. Read the most recent file in `.localbrain/sessions/`.
4. Inspect the current Git branch and working tree.
5. If the working tree is clean, confirm the branch is synchronized before making changes.
6. Continue from the `Next action` in `NOW.md` unless the user's current instruction overrides it.
7. Do not make the user reconstruct prior context that already exists in these files.

## During work

Maintain the state only when something materially changes.

Update `NOW.md` when:
- the active objective changes
- the active build slice changes
- a blocker appears or clears
- the next action changes
- the repo/branch used for the work changes

Append to `DECISIONS.md` only for durable decisions that future sessions should not have to rediscover.

Do not turn Local Brain into a transcript.

## Session handoff

When the user says `handoff`, `switch computers`, `wrap up`, `stop here`, or otherwise ends the work session:

1. Update `.localbrain/NOW.md` so it accurately reflects the repository right now.
2. Create or append today's file in `.localbrain/sessions/YYYY-MM-DD.md`.
3. Record any durable new decisions in `.localbrain/DECISIONS.md`.
4. Inspect `git diff` and `git status`.
5. Run appropriate validation for the work that changed when practical.
6. Commit the relevant completed work and Local Brain state if repository policy permits commits.
7. Push the current branch if repository policy permits pushes.
8. Never force-push for a mobility handoff.
9. Never hide an uncommitted or unpushed state. If anything remains local, state it clearly.
10. Finish with a compact handoff summary:
   - branch
   - last commit
   - validation status
   - blocker
   - exact next action

## Conflict rule

Git is the source of truth for project files.

If `.localbrain/` disagrees with the actual repository:
- trust the repository
- correct `.localbrain/`
- note the correction in the session log

## Scope rule

`.localbrain/` tracks current operational context, not permanent documentation.

Permanent architecture, product, API, or business documentation belongs in the repository's normal docs.
