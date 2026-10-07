# Cubby

Cubby is a simple, self-hosted app that keeps track of your child's spare clothes at daycare or preschool. Check off what you took home to wash, and see at a glance what to pack for tomorrow.

## How it works

1. Start with a list of the spare clothes that should be at preschool (socks, underwear, pants, mittens and so on).
2. When you take something home to wash, tap it in the app. It moves to the **Bring tomorrow** summary at the top.
3. After you've dropped everything off, tap **I've dropped everything off** to reset the list.

The list is stored on the server, so everyone who picks up and drops off sees the same status. The page refreshes automatically every 15 seconds.

## Features

- Shared checklist, no accounts needed
- Add and remove items, and set how many of each, with the **Edit** button (e.g. Socks ×2)
- When you take something home you can choose how many to bring back
- Optional evening reminder to your phone via [ntfy](https://ntfy.sh)
- Mobile-friendly, with light and dark mode
- No external dependencies, just Node.js
- Data persists in a Docker volume

## Run with Docker Compose

```yaml
services:
  cubby:
    build: .
    container_name: cubby
    ports:
      - "3001:3001"
    environment:
      TZ: Europe/Stockholm
      NTFY_URL: ${NTFY_URL:-}
      REMINDER_TIME: ${REMINDER_TIME:-19:00}
    volumes:
      - cubby-data:/data
    restart: unless-stopped

volumes:
  cubby-data:
```

```bash
docker compose up -d --build
```

Then open http://localhost:3001.

## Install in Portainer

1. Go to **Stacks** > **Add stack**.
2. Choose **Repository** as the build method.
3. Repository URL: `https://github.com/axst182/Cubby`
4. Repository reference: `refs/heads/main`, or a release tag such as `refs/tags/v0.1.1`
5. Compose path: `docker-compose.yml`
6. Click **Deploy the stack**, then open `http://<your-server>:3001`.

To update, change the reference to the new tag (or just pull the latest `main`) and click **Update the stack**. Your data is kept in the `cubby-data` volume.

## Configuration

| Variable   | Default | Description                      |
|------------|---------|----------------------------------|
| `PORT`     | `3001`  | Port the server listens on       |
| `DATA_DIR` | `/data` | Where `items.json` is stored     |
| `TZ`       | `Europe/Stockholm` | Time zone for the reminder |
| `NTFY_URL` | _(empty)_ | ntfy topic URL. Reminders are off if empty |
| `REMINDER_TIME` | `19:00` | Time of the evening reminder (HH:MM) |

To change the default starting list, edit `DEFAULTS` in `server.js` before the first start. After that, use **Edit** in the app.

## Evening reminder

Cubby can send a push notification to your phone when something is marked **Bring tomorrow**.

1. Install the ntfy app and subscribe to a topic with a hard-to-guess name, e.g. `cubby-x7k2p9`.
2. Set `NTFY_URL=https://ntfy.sh/cubby-x7k2p9` (in Portainer: stack **Environment variables**).
3. Redeploy. Every evening at `REMINDER_TIME` you get a message like *"Bring tomorrow: Socks ×2, Mittens"*.

No reminder is sent if nothing is marked, or on Friday and Saturday evenings. To test it, run `curl -X POST http://localhost:3001/api/remind`. You can also self-host ntfy and point `NTFY_URL` at your own server.

## Security

Cubby has no login. Run it on your home network, or put a reverse proxy with authentication in front of it if you expose it to the internet.

## Project structure

```
Dockerfile
docker-compose.yml
server.js      # tiny HTTP server and JSON API
index.html     # the whole front end
```

## API

| Method   | Path              | Description                          |
|----------|-------------------|--------------------------------------|
| `GET`    | `/api/items`      | List all items                       |
| `POST`   | `/api/items`      | Add an item (`{ "name": "Socks", "qty": 2 }`)  |
| `PATCH`  | `/api/items/:id`  | Update `bring`, `bringQty` or `qty`  |
| `DELETE` | `/api/items/:id`  | Remove an item                       |
| `POST`   | `/api/reset`      | Clear all "bring tomorrow" flags     |
| `POST`   | `/api/remind`     | Send the reminder now                |
