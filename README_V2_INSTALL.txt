WTT JOB TRACKER V2 | INSTALL GUIDE
==================================
IMPORTANT: This build has not been tested against your live Supabase or Netlify account. Test with sample jobs before using it for payroll or auditing.

1. In Supabase, open SQL Editor and run sql/v2.sql once. This creates V2 tables and locks down the old V1 browser database permissions. It does not delete existing V1 records.
2. In Netlify, open Site configuration > Environment variables and set:
   SUPABASE_URL = your existing Supabase project URL
   SUPABASE_SERVICE_ROLE_KEY = Supabase secret service-role key (NEVER put this in website files)
   V2_SESSION_SECRET = a long random secret of at least 32 characters
   V2_BOOTSTRAP_SECRET = a DIFFERENT long random secret, used for owner account setup and emergency PIN recovery
   Set variables for Functions; trigger a new deploy after saving.
3. Extract this ZIP. Copy the CONTENTS into your original wtt-job-tracker folder, replacing matching files. IMPORTANT: delete the old V1 files listed in the ZIP's REMOVALS.txt from the original folder too; copying files alone does not delete them.
4. Commit and push using GitHub Desktop. Netlify should deploy automatically. Go Live cannot run the Netlify API, so test on the Netlify site.
5. Open the live site. Enter the bootstrap secret and a new 6-8 digit owner PIN. Select Owner to sign in.
6. In Settings / users, create Flo, Mick, Dylan, Chris as admin users, with their own 6-8 digit PINs and colours. Add any workers later.
7. Create a sample job, assign it, log in as the worker, clock in, start a job, stop with notes, take a break, clock out, and verify the job and time entries from admin view.
8. To reset another person's PIN, log in as Owner/admin, edit the user and set a new PIN. To reset Owner if locked out, use the recoverOwner API action with the V2_BOOTSTRAP_SECRET from Netlify. Contact ChatGPT for the exact safe recovery steps. Keep this recovery secret private.

NOT INCLUDED: email submission, auto-submit, payroll calculations, live refresh across devices, offline operation, time editing/audit overrides. Avoid treating it as production-tested until the full workflow is verified on real devices.

SECURITY: The V2 API stores salted scrypt PIN hashes and uses server-only Supabase credentials. The old V1 public tables are locked down by the migration. PIN attempts are locked for 15 minutes after 5 failures. PIN reset does not reveal old PINs.
