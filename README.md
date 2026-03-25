# Bond CF Schedule Generator — Deployment Guide

## Quick Start (Local)
```bash
cd bond-cf-app
npm install
npm run dev
```
Opens at http://localhost:5173

---

## Deploy to Vercel (Recommended — Easiest)

### One-time setup (5 minutes):

1. **Push to GitHub**
   - Go to https://github.com/new → create a repo called `bond-cf-generator`
   - Run these commands:
   ```bash
   cd bond-cf-app
   git init
   git add .
   git commit -m "Bond CF Schedule Generator"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/bond-cf-generator.git
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to https://vercel.com → Sign up with GitHub
   - Click "Add New Project"
   - Import your `bond-cf-generator` repo
   - Framework Preset: **Vite**
   - Click **Deploy**
   - Done! You get a URL like `bond-cf-generator.vercel.app`

3. **Share with team**
   - Share the Vercel URL — anyone with the link can use it
   - Every `git push` auto-deploys updates

---

## Deploy to Render (Alternative)

1. Push to GitHub (same as above)
2. Go to https://render.com → New → Static Site
3. Connect your GitHub repo
4. Build Command: `npm run build`
5. Publish Directory: `dist`
6. Click "Create Static Site"

---

## Deploy to Netlify (Alternative)

1. Push to GitHub (same as above)  
2. Go to https://netlify.com → Add new site → Import from Git
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

---

## Notes
- This is a **static site** — no server needed, completely free on all platforms
- All calculations run in the browser, no data leaves the user's machine
- Works on mobile too
