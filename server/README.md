# NYC Life server

The backend for online play. It's one small Node program:

- **Accounts:** username + password + email. Passwords are hashed with scrypt. Email is used for "forgot password" and confirming your address.
- **Cloud saves:** one save per account. A revision number stops two phones from overwriting each other.
- **Real players' leaderboard:** 3-day seasons on the same clock as the game. The top 3 claim a prize once. Points are capped per report and per hour.
- **Gallery:** paintings players hang, with likes (once per player).
- **Money transfers:** send game money by username.
  - Up to $3,000 per game day goes straight through.
  - More than that becomes a wire, which an admin reviews.
  - The receiver collects it.
  - Sending needs a confirmed email.
- **Live city:** other signed-in players walk around your area, with names over their heads, emotes and chat.
  - The server checks every move: on the map, and no faster than a car.
  - Chat is filtered and rate-limited.
- **Reports and admin:** players can flag players, paintings and chat. Admins review wires and reports, hide art and ban.

Built with Colyseus (real-time rooms) on Node 22+. The database is the SQLite that's built into Node, so nothing else needs installing.

## Run it locally

```bash
cd server
npm install
npm run dev          # http://localhost:2567, restarts on changes
npm test             # 15 tests: every API flow + two live clients in a room
```

Then open the game with the server address in the URL (the game remembers it on that device):

```
http://localhost:5173/?api=http://localhost:2567
```

Use `?api=off` to forget it. Without an email key, emails (confirm, reset) are printed in the server's log, so you can copy the links from there.

## Settings (environment variables)

| Variable | What it does | Default |
| --- | --- | --- |
| `PORT` | Port to listen on | `2567` |
| `DB_PATH` | The SQLite file. **Put it on a persistent disk.** | `./data/nyc-life.db` |
| `GAME_URL` | Where the game lives; links in emails open it | `https://peterukor.github.io/NYC-life/` |
| `ADMINS` | Comma-separated usernames with admin powers | none |
| `RESEND_API_KEY` | Sends real email through [Resend](https://resend.com). Without it, emails go to the log | none |
| `MAIL_FROM` | The "from" address (must be a domain verified in Resend) | `NYC Life <no-reply@nyclife.game>` |
| `TRUST_PROXY` | `1` behind a hosting proxy, so rate limits see real IPs | off (`1` in Docker) |
| `SESSION_DAYS` | How long you stay signed in without playing | `60` |

## Deploy

The `Dockerfile` at the repo root builds the server. Any host that runs a container with a persistent disk works. For example:

- **Fly.io:** `fly launch` (it finds the Dockerfile), then `fly volumes create data --size 1` and mount it at `/data`.
- **Render or Railway:** a new "Web Service" from this repo using the Dockerfile, with a disk mounted at `/data`.
- **Your own VPS:** `docker build -t nyc-life-server . && docker run -d -p 2567:2567 -v nyc-data:/data --restart unless-stopped nyc-life-server`, behind HTTPS (for example Caddy).

The server must be on **https://**, because the game is served over https and browsers block insecure connections from it. WebSockets use the same address.

Then switch the live game online: GitHub repo → Settings → Secrets and variables → Actions → **Variables** → New variable `API_URL` = your server's address (for example `https://nyc-life-server.fly.dev`). The next deploy of the game connects to it. Delete the variable to go back to offline.

## Good to know

- The game still runs on the player's phone (money, needs…). The server enforces what it can: caps, limits, one-time claims, movement speed. A fully server-run economy is the next big step if cheating becomes a problem.
- One SQLite file on one server comfortably handles thousands of players. For more, swap `src/db.ts` for Postgres and run Colyseus with Redis presence (`@colyseus/redis-presence`).
- Back up `DB_PATH` regularly (stop the server or use `sqlite3 .backup`).

## API

All under `/api`. Send JSON, and send `Authorization: Bearer <token>` when signed in.

- **Accounts:** `POST auth/register {username, email, password}`, `auth/login {login, password}`, `auth/logout`, `GET auth/me`, `POST auth/forgot {email}`, `auth/reset {token, password}`, `auth/verify {token}`, `auth/verify/resend`, `auth/password {old, password}`, `auth/email {password, email}`, `auth/delete {password}`
- **Save:** `GET save`, `PUT save {rev, save, force?}`
- **Season:** `POST season/points {points}`, `GET season/board`, `POST season/claim {season}`
- **Gallery:** `GET art`, `POST art {title, img}`, `POST art/:id/like`
- **Players:** `GET players?q=`, `GET players/:name`
- **Money:** `POST transfers {to, amount, note?}`, `GET transfers/inbox`, `POST transfers/:id/collect`
- **Moderation:** `POST reports {kind, target, reason}`; admin: `GET admin/queue`, `POST admin/wires/:id {approve}`, `admin/reports/:id/resolve`, `admin/art/:id/hide`, `admin/users/:name/ban {ban}`
- **Real-time:** room `city`, joined with `{area, token, x, z, look}`. Messages: `move`, `travel`, `place`, `emote`, `say`.
