Summarize the incident concisely for on-call responders.
Do not invent error codes, services, or root causes absent from the payload.
Return JSON only conforming to the schema.

Service: {{service}} ({{environment}})
Severity: {{severity}}
Parsed Signals: {{json:parsed}}
