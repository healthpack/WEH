# War Era History

A standalone, single-account explorer with three views: **Fingerprint**, **Heatmap**, and **Daily trends**.

1. Create a WarEra API key in settings using the blue **CREATE TOKEN** button at the bottom of the page. Enter the copied key; a protected official-API request must succeed before the explorer opens. Reopening Change API key prefills the last validated key and lets you return to your existing results.
2. Paste a profile URL, enter a user ID, or search by username. The example profile is prefilled. Ambiguous names show selectable matches.
3. Observe the charts populate as transaction pages arrive. Stop cancels queued requests, active fetches, retries, and rate-limit waits; already fetched observations remain visible. Search new user stops the current collection and opens the search overlay.

The key stays in page memory, is never placed in a URL or persisted, and is sent only in the `X-API-Key` header to the official API and WarEraStats gateway. Reloading requires entering it again. This is a static app with no backend, shared cache, Redis dependency, or Oracle runtime dependency.

## History and transport

Nine action types use the extracted Oracle request scheduler, gateway-first transport, official fallback, and cancellation helpers. Every upstream attempt, including fallbacks and key validation, is admitted through the same queue. Rate limits cause a cancellable cooldown; they do not truncate history.

Each type walks cursors to exhaustion, with **no lookback, transaction, or page cap**. Timestamps and known rows never prematurely end pagination. Repeated cursors, malformed pages, and failures are recorded as incomplete acquisition. Browser memory and the histories actually exposed by the upstream services determine the available data.

Coverage is kept separate from observations. Wages include own work only. Equipment sellers use listing time and buyers use purchase time. Received donations/tips and resource-offer timestamps have explicit uncertainty; resource offers and received transfers are excluded from the heatmap. Battle loot includes case drops only. Hatched regions indicate incomplete acquisition, and 7-day means are withheld until contributing days are verified.

Action-type filters do not refetch data; Shift-click selects only one type. Timing details are available by hovering over the filter buttons. Monochrome mode uses a single cyan color, while Color by type uses consistent action colors for fingerprint points, heatmap cell segments, and daily trend lines. Fingerprint supports wheel zoom, shift-wheel hour zoom, and drag panning.

The timezone selector rebuckets dates and hours across all three graphs without changing the original timestamps. Local-day coverage uses the actual timezone boundaries, including daylight-saving transitions. Loading feedback appears immediately and remains visible while history pages are collected.

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
