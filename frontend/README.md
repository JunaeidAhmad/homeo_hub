# HomeoHub web app

Next.js (App Router, TypeScript). See the [root README](../README.md) for setup.

```bash
npm run dev        # http://localhost:3000 (expects the API on API_BASE_URL)
npm test           # Vitest
npm run typecheck  # next typegen + tsc
npm run lint
```

Language, areas and the mobile-first rule are explained in the root README.

`src/api/schema.d.ts` and `src/api/openapi.yaml` are generated — run `npm run api:generate`, don't edit them.
