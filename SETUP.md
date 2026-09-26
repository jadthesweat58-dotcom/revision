# Setting up your revision app

About 10–15 minutes, all in your web browser (iPad or Mac both work). You only do this once.
After this, every change pushed to GitHub updates your app automatically.

You'll set up two free services:

- **Vercel** puts the app on the internet.
- **Supabase** is the database that stores your topics, scores and sessions.

---

## Part A: Put the app on Vercel

1. Go to **vercel.com** and choose **Sign Up** (or **Log In**) → **Continue with GitHub**.
   Pick the free **Hobby** plan if it asks.
2. Click **Add New…** → **Project**.
3. Find the **revision** repository and click **Import**.
   - Can't see it? Click **Adjust GitHub App Permissions** and allow Vercel to see the `revision` repository.
4. Leave the settings alone. Open the **Environment Variables** section and add one:
   - **Key:** `APP_PASSWORD`
   - **Value:** the password you'll use to open the app. Make it long, and **don't** use your school password.
5. Click **Deploy** and wait about a minute.
   You'll probably see a page saying **"Almost there… still needs a database"**. That's expected. Part B fixes it.

## Part B: Add the free Supabase database

1. In your Vercel project, open the **Storage** tab and click **Create Database**.
2. Choose **Supabase**, then **Continue**.
3. Choose the **Free** plan. If it asks for a region, pick **London (eu-west-2)**. Name it `revision`, then **Create**.
4. When it asks which environments to connect, leave **Development, Preview and Production** all ticked and click **Connect**.
   This adds the database address (`POSTGRES_URL`) to your project automatically. You don't need to copy anything.
5. Open the **Deployments** tab. Tap the **⋯** menu on the top deployment, then **Redeploy**, then **Redeploy** again. Wait for it to finish.

The app creates its own tables and fills in all your subjects and topics the first time it opens. There's no SQL to paste.

## Part C: Open it on your iPad

1. On the Vercel project page, tap **Visit**, or tap the web address under **Domains** (it looks like `revision-something.vercel.app`).
   That address is your app. Bookmark it.
2. Type your password.
3. **Make it an app:** in Safari, tap the **Share** button (square with an arrow), then **Add to Home Screen**, then **Add**.
   It now opens full-screen from your home screen, like a normal app. You'll need to log in once more inside it.
4. **On your Mac:** in Safari, choose **File → Add to Dock**. In Chrome, click the install icon at the right of the address bar.

---

## First things to do in the app

- **Geography:** open Subjects → Geography. Tap each option you **don't** study and choose **I don't study this**.
  You study 2 of Rivers/Coasts/Hazards, 2 of Economic activity/Rural/Urban, and 1 global issue.
- **English Literature:** tap each set-text slot and rename it to your actual text in the **Edit** box
  (e.g. "Modern drama: An Inspector Calls"). Then add themes, characters and quotes.
- **Dates:** go to **Homework & tests** and fix any date marked **TBC** once you know it.
- **Grade boundaries:** on each subject page, open **Grade boundaries** and replace the estimates with the latest
  official numbers from Pearson's grade boundaries PDF.
- **Rate your topics:** tap R / A / G on topics you already know how you feel about. This makes the daily plan much smarter.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| "Almost there" page | In Vercel: **Settings → Environment Variables**. Check `APP_PASSWORD` and `POSTGRES_URL` both exist, then **Redeploy**. |
| "Application error" or the app can't reach the database | Free Supabase projects pause after a week without use. The app's daily background job should stop that happening. If it does pause, log in at **supabase.com**, open the project and click **Restore**. |
| Forgot your password | Change `APP_PASSWORD` in Vercel, then **Redeploy**. This also logs out every device. |
| The Storage tab doesn't offer Supabase | Create a free project at **supabase.com** (region London). Click **Connect**, then copy the **Transaction pooler** connection string (the one with port 6543) and put your database password into it. Add it in Vercel as an environment variable called `DATABASE_URL`, then **Redeploy**. |

## Keeping it private

- Every page needs your password. Logging in lasts 90 days on each device.
- Your data lives in your own Supabase project. Only the app, using the secret address Vercel stores for it, can read it.
- Never share your `APP_PASSWORD` or the database address with anyone, including in chats.
