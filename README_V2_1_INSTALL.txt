WTT JOB TRACKER V2.1 INSTALL

1. In Supabase SQL Editor run sql/v2_1.sql. This is an additive migration; it does not delete jobs.
2. Extract ZIP. Copy contents into existing wtt-job-tracker folder, replacing matching files. Keep .git intact.
3. In GitHub Desktop commit and push to main. Netlify automatically deploys.
4. Refresh website (Ctrl+F5). Test with SAMPLE jobs: create client and job; assign staff; start/stop; leave notes; set On Hold with reason; complete; reopen as admin; verify dashboard and live staff status.
5. No Netlify environment variable changes are required.

IMPORTANT: This is an unverified test build. It has not been end-to-end tested against your live Supabase or Netlify. Do not rely on it for payroll or auditing until the workflow passes on real devices.

Note: V2.1 adds a new client table and job number sequence; new job numbers start at 1100001. Existing V2 jobs retain their numbers.
