# URL Shortening Service

Production-ready full-stack URL shortener with analytics, custom aliases, QR codes, expiration, and password protection.

## Features

- Instant URL shortening with validation and sanitization
- Custom aliases with real-time availability
- QR code generation
- Click tracking (device, geo, referrer)
- Link expiration (presets + custom)
- Password protection (bcrypt hashed)
- Bulk shortening
- Dark/light mode
- Responsive, accessible UI
- Rate limiting and security headers
- Search, filters and sorting in history

## Tech Stack

**Backend:** Node.js + Express + nanoid + bcryptjs + helmet + rate-limit  
**Frontend:** Vanilla JS (ES Modules) + CSS Custom Properties + Chart.js + qrcode.js  
**Storage:** JSON file persistence (easily replaceable with SQLite/Postgres)

## Quick Start

### Backend

```bash
cd backend
npm install
npm start
```

API runs on `http://localhost:3000`

### Frontend

```bash
cd frontend
npx serve
# or
python -m http.server 8080
```

Open the address shown. The frontend talks to `localhost:3000`.

## Features implemented

- Single URL shorten + custom alias + expiration + password + tags
- Bulk shorten (up to 50 URLs)
- QR code on creation
- Analytics dashboard (timeline + doughnut charts) with period filters
- Search, status filter and sorting in the history list
- Dark/light mode
- Sample data seeded on first run (`demo` and `gh` links)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/shorten` | Create short link |
| POST | `/api/shorten/bulk` | Bulk create |
| GET | `/api/links` | List all links |
| GET | `/api/analytics/:code` | Analytics for link |
| GET | `/:code` | Redirect (tracks click) |
| GET | `/api/health` | Health check |
