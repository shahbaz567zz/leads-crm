# CollegeTpoint Leads CRM

Standalone Next.js 16 CRM for Meta Ads lead intake, telecaller assignment, follow-up management, office meeting scheduling, SLA tracking, CSV bulk import, and admissions conversion reporting.

## What is included

- Role-based login for admin, manager, and telecaller accounts
- Lead pipeline from `NEW` to `CONVERTED`
- Round-robin assignment with a separate high-priority telecaller pool
- Follow-up reminders, activity logging, meeting scheduling, and SLA watchlists
- Reporting widgets for stage mix, campaign yield, telecaller workload, and conversion pressure
- CSV lead import with duplicate detection and downloadable template
- CSV export for filtered lead lists and dashboard report summaries
- Configurable SLA breach notifications with manager toggles for email and WhatsApp
- Meta lead webhook ingestion with duplicate merge by phone or lead id
- MSG91 WhatsApp acknowledgement hook for instant lead response
- Prisma schema and seed script for MySQL

## Stack

- Next.js 16
- React 19
- TypeScript
- Prisma 6.17.1 + MySQL
- Tailwind CSS 4

## Environment setup

Copy `.env.example` to `.env` and fill these values:

```env
DATABASE_URL="mysql://root:password@127.0.0.1:3306/leads_crm"
AUTH_SECRET="replace-with-a-long-random-secret"

META_VERIFY_TOKEN="your-meta-webhook-verify-token"
META_ACCESS_TOKEN="your-meta-page-access-token"

ENABLE_MSG91_AUTO_REPLY="true"
MSG91_AUTH_KEY="your-msg91-auth-key"
MSG91_WA_INTEGRATED_NUMBER="918115840455"
MSG91_WA_TEMPLATE_NAME="lead_acknowledgement"
MSG91_WA_TEMPLATE_NAMESPACE="your_template_namespace"

SLA_NOTIFICATION_CHECK_INTERVAL_MINUTES="15"
SLA_NOTIFICATION_MIN_REPEAT_MINUTES="60"
SMTP_HOST="smtp.mailtrap.io"
SMTP_PORT="2525"
SMTP_USER="your-smtp-username"
SMTP_PASSWORD="your-smtp-password"
EMAIL_FROM="crm@collegetpoint.in"
MSG91_SLA_TEMPLATE_NAME="crm_sla_digest"
MSG91_SLA_TEMPLATE_NAMESPACE="your_sla_template_namespace"
```

You can reuse the MySQL host, port, username, password, and MSG91 auth key from the existing backend config, but set `DATABASE_URL` to a new database name for this project.

## Local run

1. Create the MySQL database.

```sql
CREATE DATABASE leads_crm;
```

2. Install dependencies if needed.

```bash
npm install
```

3. Generate Prisma client and push the schema.

```bash
npm run db:generate
npm run db:push
```

4. Seed the CRM users.

```bash
npm run db:seed
```

5. Start the app.

```bash
npm run dev
```

6. Open `http://localhost:3000/login`.

Use the seeded admin email and password from `.env`. By default that is:

- `admin@collegetpoint.in`
- `ChangeMe123!`

Change the seed password immediately after first login by updating the user in Prisma Studio or reseeding with a new `SEED_DEFAULT_PASSWORD` value.

## Meta webhook notes

- Verification endpoint: `/api/integrations/meta/webhook`
- Configure the same URL in Meta Lead Ads webhook settings
- The route fetches lead field data from Graph API using `META_ACCESS_TOKEN`
- Duplicate leads are merged into the existing record using `metaLeadId` or normalized phone number

## CSV import notes

- Manager and admin users can upload CSV files from the dashboard
- Download the CRM template from `/lead-import-template.csv`
- Supported columns include `name`, `phone`, `city`, `course_interest`, `jee_rank_range`, `campaign_name`, `source`, `priority`, and optional `assigned_to_email`
- Raw Meta lead export CSV files are also supported directly, including columns like `id`, `created_time`, `full_name`, `phone`, `campaign_name`, `ad_name`, `adset_name`, `form_id`, `where_did_you_complete_your_12th_from?`, and `what_is_your_expected_/_actual_jee_main_rank?`
- Meta test rows are skipped automatically, and imported Meta rows preserve campaign/ad/form metadata plus the original lead timestamp
- Rows with an existing normalized phone number are skipped as duplicates and returned in the import summary

## CSV export notes

- `GET /api/exports/leads` exports the currently scoped lead list as CSV
- `GET /api/exports/reports` exports the dashboard summary, stage mix, campaign, and telecaller metrics as CSV
- The dashboard includes buttons for both exports, and the lead-list export preserves the currently applied filters

## SLA notification automation

- Manager and admin users can enable or disable email and WhatsApp SLA notifications from the dashboard
- Admin users can also enable or disable automatic lead assignment from the dashboard
- The automation scheduler runs inside the Next.js server process, so it requires the app to stay running under PM2, `npm start`, or a similar persistent process
- The scheduler checks for breaches every `SLA_NOTIFICATION_CHECK_INTERVAL_MINUTES`
- Repeat notifications are throttled by `SLA_NOTIFICATION_MIN_REPEAT_MINUTES`
- Email notifications go to active admin/manager users plus any extra addresses in `SLA_NOTIFICATION_EMAIL_RECIPIENTS`
- WhatsApp notifications go to active admin/manager phone numbers plus any extra numbers in `SLA_NOTIFICATION_WHATSAPP_RECIPIENTS`
- The dashboard also includes a `Run now` button for manual dispatch

## MSG91 notes

The WhatsApp helper expects a template with three body variables:

1. Lead name
2. Campaign name
3. CTA text such as `Our counsellor will call you shortly.`

If your MSG91 template uses different component keys, adjust `src/lib/msg91.ts`.

The SLA WhatsApp digest expects a dedicated template configured through:

1. `MSG91_SLA_TEMPLATE_NAME`
2. `MSG91_SLA_TEMPLATE_NAMESPACE`
3. `MSG91_SLA_TEMPLATE_LANGUAGE`

The digest payload currently sends:

1. Overdue follow-up count
2. Untouched lead count
3. Top lead label
4. Dashboard URL

## Useful scripts

```bash
npm run dev
npm run lint
npm run build
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
```
