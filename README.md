# War Era History

A standalone, single-account explorer with three views: **Fingerprint**, **Heatmap**, and **Daily trends**.

1. Create a WarEra API key in settings using the blue **CREATE TOKEN** button at the bottom of the page. Enter the copied key; a protected official-API request must succeed before the explorer opens. Reopening Change API key prefills the last validated key and lets you return to your existing results.
2. Paste a profile URL, enter a user ID, or search by username. The example profile is prefilled. Ambiguous names show selectable matches.
3. Observe the charts populate as transaction pages arrive. Stop cancels queued requests, active fetches, retries, and rate-limit waits; already fetched observations remain visible. Search new user stops the current collection and opens the search overlay.

The validated key is saved in this browser's local storage and revalidated on reopening or refreshing the page. A rejected replacement never overwrites the previous working key. It is never placed in a URL and is sent only in the `X-API-Key` header to the official API and WarEraStats gateway. If browser storage is unavailable, the key works for the current visit and the app reports that it could not be saved. This is a static app with no backend, shared cache, Redis dependency, or Oracle runtime dependency.

Account scans have shareable paths, for example `https://healthpack.github.io/WEH/69a46f7413e0dcf990d09340`. Opening an account link validates the remembered key and starts that account's scan automatically. Without a key, it requests one first and starts the queued account after validation. Browser Back and Forward also load the account in the path. The build includes the app shell as `404.html` so GitHub Pages can serve arbitrary account links directly; the shell retains the requested URL (the initial document has HTTP 404 status on Pages).

## History and transport

Nine action types use the extracted Oracle request scheduler, gateway-first transport, official fallback, and cancellation helpers. Every upstream attempt, including fallbacks and key validation, is admitted through the same queue. Rate limits cause a cancellable cooldown; they do not truncate history.

Each type walks cursors to exhaustion, with **no lookback, transaction, or page cap**. Timestamps and known rows never prematurely end pagination. Repeated cursors, malformed pages, and failures are recorded as incomplete acquisition. Browser memory and the histories actually exposed by the upstream services determine the available data.

Coverage is kept separate from observations. Wages include own work only. Article tips and donations include only transfers sent by the selected user; received transfers are excluded from every chart and event count. Equipment includes only the selected user's listings at `offerCreatedAt`, never purchases or sale completion time. Listings repeated across transaction rows are deduplicated by item and listing time. The transaction feed reveals listings that resulted in a sale, so unsold or cancelled listings are not a complete historical record here. Resource transactions expose an offer timestamp without identifying its owner or buy/sell order side; all such rows are excluded from charts and event counts rather than assigning another user's order to the selected account. Their raw fetched-row counts remain available in acquisition details. Battle loot includes case drops only. Incomplete acquisition is shown in status, acquisition details, and chart tooltips; charts have no hatch pattern. The 7-day means are withheld until contributing days are verified.

Action-type filters do not refetch data; Shift-click selects only one type. Timing details are available by hovering over the filter buttons. Monochrome mode uses a single cyan color, while Color by type uses consistent action colors for fingerprint points, heatmap cell segments, and daily trend lines. Fingerprint supports wheel zoom, shift-wheel hour zoom, and drag panning.

The timezone selector rebuckets dates and hours across all three graphs without changing the original timestamps. Local-day coverage uses the actual timezone boundaries, including daylight-saving transitions. Loading feedback appears immediately and remains visible while history pages are collected.

Selecting Resource offers alone explains that historical listing ownership is unavailable. The public order book identifies owners of currently open orders, but cannot reconstruct filled or cancelled offers. Selecting Battle cases alone explains when the transaction history contains no timestamped case drops. The case recognizer accepts regular/elite case codes and `woodenCase`, while excluding equipment awards. `battleLootSummary.getByBattleAndUser` exposes case totals per battle (`case1Count`, `case2Count`) without a timestamp for each drop; its document creation/update timestamps are not individual attack or drop times and are not plotted. Acquisition details show raw fetched-row counts alongside accepted events so exclusions are visible.

## Development

Requires Node.js 22.12 or newer.

```sh
npm ci
npm test
npm run dev
npm run build
```

GitHub Actions publishes `main` to GitHub Pages at `https://healthpack.github.io/WEH/`. The build sets `/WEH/` as its base only on GitHub Actions; local development uses `/`.

## Extracted from WarEra-Oracle

Only the request scheduler, cancellable fetch helpers, transport, history pagination, event-time transforms, fingerprint canvas, heatmap/trends components, and their small analysis helpers are included. The scanning engine, discovery, multi-account comparison, detection heuristics, stored account database, country reports, and market-impact reports are not required.

Supported by [warerastats.io](https://warerastats.io), using the [WarEraStats gateway](https://gateway.warerastats.io/) and [official WarEra API](https://api2.warera.io/docs/).
