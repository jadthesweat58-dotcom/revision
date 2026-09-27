# Connecting Microsoft Teams

This lets the app read your Teams **assignments** (title, class, due date, instructions) every morning
and put them into your daily plan. It can only **read**. It never changes, submits or deletes anything in Teams.

It takes about 10 minutes in your web browser. There are three parts:

1. Register the app with Microsoft, so Microsoft knows it's allowed to ask for your homework.
2. Put two codes from that registration into Vercel.
3. Tap **Connect Teams** in the app and sign in with your school account.

> **Heads up:** many schools block outside apps from reading Teams. If yours does, you'll see
> **"Need admin approval"** in step 3. That's your school's decision, and the app won't try to get round it.
> You can keep adding homework yourself on the **Homework & tests** page, and later just send
> Claude a screenshot once the Claude connector is built.

---

## Part 1: Register the app with Microsoft

1. Go to **https://entra.microsoft.com** and sign in.
   - **Try your school account first.**
   - If you see **"You do not have access"**, or the **New registration** button is greyed out, your school doesn't let
     students register apps. That's fine: sign out and sign in with a **personal** Microsoft account instead
     (Outlook, Hotmail, Xbox or Skype). Or go to **https://portal.azure.com** and search for **App registrations**.
   - If it asks you to buy something or enter card details, **stop** and send me a screenshot. This step should be free.
2. In the left menu, open **Applications → App registrations**, then click **+ New registration**.
3. Fill it in:
   - **Name:** `Revision`
   - **Supported account types:** choose **"Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant)"**.
     Pick the one that says *organizational directory* only, not the one that also mentions personal accounts.
   - **Redirect URI:** set the platform to **Web** and paste exactly:
     `https://revision-xi-bay.vercel.app/api/teams/callback`
   - Click **Register**.
4. You're now on the app's **Overview** page. Find **Application (client) ID** and copy it somewhere safe.
   It looks like `1a2b3c4d-....`.
5. Make a secret:
   - Open **Certificates & secrets** (left menu), then **Client secrets**, then **+ New client secret**.
   - **Description:** `revision`. **Expires:** choose the longest option (e.g. 24 months).
   - Click **Add**, then **copy the "Value" straight away**. It's only shown once.
     Copy the **Value** column, **not** the "Secret ID".
6. Give it permission to read your homework:
   - Open **API permissions**, then **+ Add a permission**, then **Microsoft Graph**, then **Delegated permissions**.
   - Search for and tick each of these:
     - `EduAssignments.ReadBasic`: your assignments (no grades)
     - `EduRoster.ReadBasic`: your class names, so homework can be matched to subjects
     - `offline_access`: lets the app check every morning without you signing in each time
   - Click **Add permissions**. `User.Read` is already there; leave it.
   - **Don't** click "Grant admin consent". You don't need to, and a student account can't anyway.

## Part 2: Put the codes into Vercel

1. Go to **vercel.com**, open your **revision** project, then **Settings → Environment Variables**.
2. Add two variables:
   - **Key:** `MS_CLIENT_ID`. **Value:** the Application (client) ID from step 4.
   - **Key:** `MS_CLIENT_SECRET`. **Value:** the secret **Value** from step 5.
3. Click **Save**.
4. Open **Deployments**. On the top one, click **⋯**, then **Redeploy**, and wait about a minute.

Never paste the secret into a chat, including this one. It only belongs in Vercel.

## Part 3: Connect

1. Open the app and go to **Homework & tests**, then **Connect Teams**.
2. Sign in with your **school** Microsoft account.
3. What you might see:
   - **A list of permissions with an Accept button:** tap **Accept**. You'll come back to the app with your homework listed.
   - **"Unverified" next to the app name:** that's normal. It's your own app, not a company's.
   - **"Need admin approval":** your school blocks outside apps. Tap **Return to the application without granting
     consent** (or just close it). The app will say Teams isn't available and everything else keeps working.
     If you like, you can ask your school's IT team to approve an app called "Revision". That's the proper route,
     but it's completely optional.
4. Check **Your Teams classes**. Each class is matched to a subject automatically. Fix any it got wrong, and set
   non-GCSE classes (like Tutor or PE) to **Not a GCSE subject**, then tap **Save subjects**.

## After that

- Every morning at about 5am (UAE time), the app checks Teams for new or changed homework and rebuilds today's plan.
- Tap **Sync now** on Homework & tests to check straight away.
- Homework you mark **Done** in the app stays done. The app can't see whether you've handed it in on Teams.
- Assignments with "test", "quiz", "exam", "assessment" or "mock" in the title are also added as tests, so their
  subject gets a boost in your plan as the date gets closer.
- The secret expires after the time you chose (e.g. 24 months). When it does, make a new one (Part 1, step 5) and update
  `MS_CLIENT_SECRET` in Vercel.
- To stop, tap **Disconnect**. To remove access completely, delete the app registration.
