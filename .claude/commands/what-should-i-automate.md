Scan the current codebase and conversation context. Identify:

1. Any workflow I'm doing manually in the CRM that could be a reusable
   slash command or automated function
2. Any repeated code patterns across the existing feature modules that
   should be extracted into shared utilities
3. Any data that's currently hardcoded that should come from Supabase
4. Any alert or calculation that runs in JS that should be a Supabase
   function or Edge Function instead

Output a ranked list of 3–5 automation opportunities with estimated
effort (small/medium/large) and revenue or time impact.
