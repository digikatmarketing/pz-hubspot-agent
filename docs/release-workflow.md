# PZ HubSpot Agent Release Workflow

This is the fastest safe workflow for making local changes, checking them on `localhost`, pushing them to GitHub, and deploying them to Railway.

## What Happens Where

- **Local repo**: write code, run `localhost`, test, build, commit
- **GitHub**: stores the source of truth and commit history
- **Railway**: runs the live app

## One-Time Setup

Run these from the repo root:

```bash
npm ci
gh auth status
railway whoami
railway link --project "eloquent-motivation"
railway service link "pz-hubspot-agent"
```

Make sure local `.env` has:

```bash
ANTHROPIC_API_KEY=...
HUBSPOT_ACCESS_TOKEN=...
APP_PASSWORD=...
PORT=3847
```

Make sure Railway variables also contain:

- `ANTHROPIC_API_KEY`
- `HUBSPOT_ACCESS_TOKEN`
- `APP_PASSWORD`

## Daily Local Dev Loop

### 1. Start local app

```bash
npm run dev
```

Open:

```text
http://localhost:3847
```

### 2. Make changes locally

- edit files in `src/`
- refresh the browser
- `tsx watch` reloads the server automatically

### 3. Validate before release

```bash
npm run check
```

If needed, also inspect git state:

```bash
git status -sb
git diff
```

## Fast Release Flow

Use this when the change is ready to go live.

### 1. Commit locally

```bash
git add <files>
git commit -m "your message"
```

### 2. Push to GitHub

```bash
git push origin main
```

### 3. Deploy the exact committed `HEAD` to Railway

```bash
npm run deploy:railway -- "Deploy short description"
```

This deploy script is important because it:

- deploys a **clean git snapshot of `HEAD`**
- avoids accidentally shipping uncommitted local files
- does not rely on Railway auto-deploy timing

### 4. Verify the live service

```bash
railway service status
railway logs --latest --lines 100
```

Health check:

```text
https://pz-hubspot-agent-production.up.railway.app/health
```

Expected result:

```json
{"status":"ok"}
```

## Fastest Hotfix Path

For small urgent fixes:

```bash
npm run dev
npm run check
git add <files>
git commit -m "Fix ..."
git push origin main
npm run deploy:railway -- "Hotfix ..."
railway service status
```

## Recommended Working Rule

When moving quickly for the next few hours:

- test each change on `localhost` first
- keep commits small and focused
- push immediately after each finished fix
- deploy immediately after each push
- verify `/health` and logs after every deploy

## Do Not Do This

- do not deploy with uncommitted work you do not want live
- do not rely on Railway redeploy if you specifically need the newest local commit; use `npm run deploy:railway`
- do not skip `npm run check` on TypeScript changes

## Practical Command Set

### Local dev

```bash
npm run dev
```

### Build check

```bash
npm run check
```

### Push code

```bash
git push origin main
```

### Deploy latest committed code

```bash
npm run deploy:railway -- "Deploy <what changed>"
```

### Check live status

```bash
npm run status:railway
railway logs --latest --lines 100
```

## Release Checklist

- local app works on `http://localhost:3847`
- `npm run check` passes
- commit created
- commit pushed to GitHub
- `npm run deploy:railway` run successfully
- Railway status is `SUCCESS`
- live `/health` returns `ok`

## Best Team Workflow For Today

If we are iterating rapidly together, the operating rhythm should be:

1. make one focused change
2. test locally
3. build check
4. commit
5. push
6. deploy to Railway
7. verify live
8. move to the next change

That gives the fastest path to live without losing control of what was shipped.
