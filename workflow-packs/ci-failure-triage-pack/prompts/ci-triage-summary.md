Summarize the CI test/build failure concisely for engineers debugging the job.
Do not invent failing test names, stack frames, or error signatures absent from the payload.
Return JSON only conforming to the schema.

Job: {{job_name}} ({{runner_os}})
Parsed Failure: {{json:parsed}}
