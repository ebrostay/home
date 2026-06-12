# Connecting ebrostay.com to Supabase

The website works without Supabase (it uses the built-in sample data).
As soon as you complete these steps, it automatically switches to the
database: dynamic listings, availability, user accounts, saved homes,
contact messages, and the admin panel.

## 1. Create the project (5 minutes)

1. Go to https://supabase.com and create a free account.
2. Click **New project**. Pick any name (e.g. `ebrostay`), set a strong
   database password (save it somewhere), and choose the **West EU**
   region (closest to Spain).
3. Wait a minute while the project is created.

## 2. Create the tables

1. In the left sidebar open **SQL Editor**.
2. Open the file `supabase/schema.sql` from this repository, copy ALL of
   it, paste it into the editor, and click **Run**.
3. You should see "Success". This creates the tables, the security
   rules, and loads the four current homes with their availability.

## 3. Connect the website

1. In Supabase go to **Project Settings → API**.
2. Copy two values: **Project URL** and the **anon public** key.
3. Put them into the file `supabase-config.js` in this repository:

   ```js
   const SUPABASE_URL = "https://xxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJ...";
   ```

   (Or just paste the two values into the Claude chat and it will be
   committed for you.) The anon key is designed to be public — all
   permissions are enforced by the database's Row Level Security rules.

4. Commit and push (or merge the PR) — once deployed, the site reads
   everything from Supabase.

## 4. Make yourself admin

1. On ebrostay.com click **Entrar → Crear cuenta** and register with
   your email. Confirm the email Supabase sends you.
2. In the Supabase **SQL Editor** run (with your real email):

   ```sql
   update public.profiles set is_admin = true where email = 'you@example.com';
   ```

3. Reload ebrostay.com — an **Administración** link appears in the
   header. It opens `admin.html`, where you can add/remove booked
   periods and change the "available from" date per home. Changes are
   visible to visitors immediately.

## Where things live

| What | Where in Supabase |
| --- | --- |
| Listings (texts ES/EN, price, capacity...) | Table editor → `properties` |
| Booked periods | `availability_blocks` (or use admin.html) |
| Contact form messages | Table editor → `inquiries` |
| Registered users | Authentication → Users |
| Saved homes per user | `favorites` |

## Optional next steps

- Get an email notification for each new inquiry: Supabase
  **Database → Webhooks** on the `inquiries` table pointing to a
  Zapier/Make webhook, or an Edge Function using Resend.
- Add new listings by inserting rows in `properties` — they appear on
  the website automatically, no code change needed.
