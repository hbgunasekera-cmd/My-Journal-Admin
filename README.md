# My Journal Admin Console

Admin console for managing travel locations, route plans, articles, social sharing, and audience activity.

## Development

- `npm install` installs dependencies.
- `npm run dev` starts the Vite development server.
- `npm run build` creates a production build.
- `npm run lint` checks the application with ESLint.

The Vite development server dispatches `/api/*` requests to the matching local handler in `api/`.

## Configuration

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` in `.env.local` or the deployment environment. Google Maps autocomplete and weather features also use `VITE_MAPS_KEY` and `VITE_WEATHER_KEY`.

Keep `ARTICLE_KEY` server-side. The local Vite API handler and deployed `/api/generate-article` endpoint use it for article and metadata generation; do not expose it through a `VITE_` variable.

Other API integrations are configured with the server-side environment variables read by files under `api/`.
