# Universal Event Parser

An open-source Node.js framework for parsing and normalizing event data from fragmented platforms like Partiful, Luma, Eventbrite, Facebook, and generic JSON-LD.

## The Problem

Scraping event pages is notoriously difficult. Extracting the title and description is only half the battle. Each platform embeds start dates, end dates, and timezones differently. Some use microdata, some inject complex JSON blobs into script tags, and others rely on generic Open Graph tags. Determining the true underlying timestamp and geographic location accurately, without being affected by the scraper server's timezone, is a complex problem.

**Universal Event Parser** solves this by providing a unified extraction engine. It handles URL detection, platform-specific adapters (for deep data extraction), timezone resolution, and field confidence scoring—all without coupling you to a specific database or infrastructure.

## Installation

```bash
npm install universal-event-parser
```

## Programmatic Usage

The core framework exposes a clean API for developers building event aggregators. It operates as a pure functional engine. 

```javascript
import { parseEvent } from 'universal-event-parser';

// Parse a public event page
const eventData = await parseEvent('https://partiful.com/e/example123');

console.log(eventData.title); // Standardized title
console.log(eventData.startAt); // Normalized UTC timestamp
console.log(eventData.timezone); // Resolved timezone string
```

### Custom Scrapers and Adapters

You can inject your own custom platform adapters via the Registry pattern.

```javascript
import { parseEvent, createDefaultRegistry } from 'universal-event-parser';
import { MyCustomAdapter } from './MyCustomAdapter.js';

const registry = createDefaultRegistry();
registry.registerAdapter(new MyCustomAdapter());

const eventData = await parseEvent('https://custom-site.com/events/1', { registry });
```

### Advanced SSRF Protection

Under the hood, the library uses `safe-fetch-guard` to validate DNS results and
pin the outbound connection to the validated public addresses. Deployments that
already have a hardened egress service can inject a response-compatible
`fetchPage` function. This is a trusted boundary: the replacement must provide
its own SSRF protection, redirect policy, timeouts, and response-size limits.

```javascript
import { parseEvent } from 'universal-event-parser';
import { secureFetchHtml } from 'your-security-lib';

await parseEvent('https://luma.com/event', { fetchPage: secureFetchHtml });
```

## Architecture

This library is designed as a **pure engine**:
- **No Database Coupling**: We give you standardized JSON; you save it how you want.
- **No Server Lifecycle**: Mount it in the HTTP framework, queue worker, CLI, or scheduler your application already uses.
- **Dependency Injection**: Network calls are decoupled, allowing you to pass a trusted `fetchPage` implementation or pre-downloaded HTML.

Version 2 removes the bundled Express process. A library should not choose a
port, rate-limit policy, proxy trust model, or error response contract for its
host application.

## License

MIT
