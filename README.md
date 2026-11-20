# GatePass & Loading Slip Manager

Full-stack plant gate queue, dispatch, loading slip (with QR verification & per-user digital signatures), liquid store, ex-factory, and driver live loading status management system.

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Vite
- **Backend**: Node.js (v22+), Express, SQLite (`better-sqlite3`)

---

## 1. Push Code to GitHub

Run these commands inside your project root folder:

```bash
git init
git add .
git commit -m "Initial commit: GatePass & Loading Slip Manager"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

> `.gitignore` automatically excludes `node_modules/`, `dist/`, `.env*`, and local SQLite `data/*.db` files so no secrets or test database records are pushed to GitHub.

---

## 2. Deploy on Hostinger (Option A: Hostinger Node.js Web App via GitHub)

1. Open **Hostinger hPanel** → **Websites** → **Add Website** → select **Node.js Web App** (or connect your GitHub repository directly).
2. Connect your GitHub account and pick your repository & `main` branch.
3. Configure the **Build & Runtime Settings**:
   - **Node.js Version**: `22.x` (required for native TypeScript execution via `node server.ts`)
   - **Entry File**: `server.ts` *(change from default `server.js` to `server.ts`)*
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
4. Add **Environment Variables** in Hostinger hPanel:
   - `NODE_ENV` = `production`
   - `APP_BASE_URL` = `https://your-domain.com` (used in QR / Driver Live Loading Status links)
   - `DB_DIR` = `/home/YOUR_HOSTINGER_USER/gatepass-data` *(recommended so your SQLite database persists across GitHub redeployments)*
   - *(Optional)* `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
5. Click **Deploy**.
6. Open your live domain and sign in with the default Administrator credentials:
   - **Username**: `munnayadav` (or your `ADMIN_INITIAL_USERNAME` env var)
   - **Password**: `Yadav@1977` (or your `ADMIN_INITIAL_PASSWORD` env var)
   - *(Recommended: change the default password from your profile or Admin Dashboard after first login.)*

---

## 3. Deploy on Hostinger VPS (Option B: Ubuntu + PM2 + Nginx)

```bash
# 1. Install Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential python3

# 2. Clone from GitHub
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /var/www/gatepass
cd /var/www/gatepass

# 3. Install dependencies & build frontend
npm install
npm run build

# 4. Configure environment
cp .env.example .env
# Edit .env and set NODE_ENV=production, PORT=3000, DB_DIR=/var/lib/gatepass-data, APP_BASE_URL=https://your-domain.com

# 5. Start with PM2 (keep 1 instance for SQLite single-writer consistency)
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Verify server health at `http://localhost:3000/api/health`, then point Nginx (`proxy_pass http://127.0.0.1:3000;`) with HTTPS SSL enabled (Certbot / Hostinger SSL).

---

## 4. Local Development

```bash
npm install
npm run dev
```
