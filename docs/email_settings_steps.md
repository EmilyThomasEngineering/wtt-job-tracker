# Email + Settings Patch Steps

## Copy files into the repo

Copy these into the same places:

- package.json
- netlify.toml
- sql/settings_email_migration.sql
- netlify/functions/send-submission-email.mjs
- netlify/functions/auto-submit.mjs

## Run the migration

Open `sql/settings_email_migration.sql`, copy all of it, paste into Supabase SQL Editor, and Run.

## Add Netlify environment variables

In Netlify, go to Site configuration -> Environment variables and add:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- RESEND_FROM_EMAIL

Important: SUPABASE_SERVICE_ROLE_KEY must never go in frontend JS.
