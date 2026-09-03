# Putting Sales Floor online

This guide takes you from "code in GitHub" to "a web address anyone on the team
can open." It assumes you have never deployed anything before.

**Roughly 20–30 minutes.** You will need a payment card — the hosts below have
free allowances, but they all ask for a card to stop people spinning up
thousands of servers.

## What you're about to do, in plain terms

Your code currently sits in GitHub, which is storage — it isn't running.
Deploying means renting a small computer that runs your app around the clock and
gives it a public address. Everything below is clicking through one host's
website; there is nothing to install on your own machine.

## Before you start: the one thing that will bite you

This app keeps its data — reps, deals, activity, uploaded training files — in a
file on disk, not in a separate database service.

That means **the host must give the app a permanent disk** (usually called a
"volume" or "disk"). Without one, hosts hand your app a blank slate on every
deploy, and everything your team logged disappears.

This is also why **Vercel and Netlify will not work** for this app, despite
being the usual advice for Next.js. They don't offer permanent disks.

Every step below that mentions `/data` is about this. Don't skip those.

## Recommended: Railway

### 1. Create the project

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Authorise Railway to see your repositories, then pick **rhodneylama/Main**.

Railway finds the `Dockerfile` in this repo and starts building. The first build
takes about 3–5 minutes. It will probably fail or restart once before you've
finished the next two steps — that's expected, keep going.

### 2. Add the permanent disk

1. Click your service, then look for **Variables / Settings / Data** along the top.
2. Find **Volumes** and add one.
3. Set the mount path to exactly:

   ```
   /data
   ```

That path matters — the app is already configured to read and write there.

### 3. Clean up the variables Railway invented

Open **Variables**. Railway reads this repo's `.env.example` and pre-creates a
variable for every name it finds — you'll see a long list of empty rows, and
possibly a couple with junk in them.

**Delete every row you are not actually setting.** An empty variable is not the
same as an absent one: your host sends the empty value to the app, where it
overrides the built-in default. That is how a deploy ends up writing its
database somewhere other than `/data` and losing everything on the next push.

Two in particular to look for:

- **`ANTHROPIC_API_KEY` with a value like `sk-ant-...`** — that's a placeholder,
  not a key. Delete the row, or paste a real key from
  [console.anthropic.com](https://console.anthropic.com/settings/keys).
- **`ANTHROPIC_AUTH_TOKEN`** — if your host generated one, delete it. The
  Anthropic SDK will try to authenticate with it and fail.

When you're done you should have only the handful of rows from the next step.

### 4. Set your password

Still on the service, open **Variables** and add:

| Name | Value |
|---|---|
| `SALESFLOOR_PASSWORD` | a password of your choosing |

**Do not skip this.** Once the app is on the public internet, this password is
the only thing between a stranger with your URL and your revenue numbers. Pick
something real, not `password123`, and share it with your team however you
normally share things.

While you're here, add these two if you want them (both optional, and both can
wait until later):

| Name | Value | What it enables |
|---|---|---|
| `ANTHROPIC_API_KEY` | your key from [console.anthropic.com](https://console.anthropic.com/settings/keys) | The AI practice calls |
| `NEXT_PUBLIC_CURRENCY` | e.g. `GBP`, `EUR` | Money shown in your currency instead of USD |

You do **not** need to set the GoHighLevel variables here — those are easier to
enter in the app's own Settings page once it's running.

### 5. Get your web address

1. Open **Settings** → **Networking**.
2. Click **Generate Domain**.

You'll get something like `main-production-a1b2.up.railway.app`. That's your
app. Open it, enter your password, and you should land on the floor dashboard
with the demo team on it.

### 6. Make it yours

- **Settings → GoHighLevel** in the app: paste your location ID and private
  integration token, tick the box, and hit **Sync**. Your real reps and deals
  replace the demo ones.
- **Team**: set each rep's quota, and remove the demo reps you don't need.
- **TV mode**: open `/tv` on the office display and press F11 for full screen.

## If something goes wrong

**The build fails.** Open the build log on the host and read the last 20 lines.
Paste them to Claude — most first-time failures are a missing Node version or a
typo in a variable name.

**Every page errors with something about a currency code.** You have an empty
`NEXT_PUBLIC_CURRENCY` variable. Delete the row or give it a real code.

**It loads but everything resets after a deploy.** The volume isn't mounted, or
isn't mounted at `/data`. Go back to step 2 — and check step 3, since an empty
`SALESFLOOR_DB_PATH` variable overrides the correct default.

**It asks for a password you never set.** You set `SALESFLOOR_PASSWORD` and
forgot it. Change it in Variables and redeploy — nothing else is lost.

**You get "Application failed to respond".** The app is still starting, or the
build failed. Wait a minute, then check the deploy log.

## Other hosts

The `Dockerfile` in this repo works anywhere that takes containers. The steps
are always the same three things: point it at this GitHub repo, mount a
permanent disk at `/data`, set `SALESFLOOR_PASSWORD`.

- **Render** — same flow. Its free tier has no disks, so you need the paid
  Starter plan for this app.
- **Fly.io** — cheapest of the three, but driven from a terminal rather than a
  website, so it's a harder first deploy.
- **Your own server** — `docker build -t salesfloor . && docker run -p 3000:3000
  -v /srv/salesfloor:/data -e SALESFLOOR_PASSWORD=... salesfloor`

## Backups

Everything lives in one folder on that disk. Whatever your host offers for
volume snapshots is your backup. Turn it on before your team puts real data in.
