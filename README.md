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

## Error logging

Browser runtime errors, unhandled promise rejections, and React render errors are inserted directly into `public.error_logs` with `reporter = 'Admin'`; server-side API failures are written with a privileged Supabase key, and the separate client app can continue writing `reporter = 'Client'`. The Dashboard Error Logs tab reads and clears rows through the public Supabase API. Apply the migrations in `supabase/migrations/` in the Supabase SQL editor, then configure `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` in `.env.local` for local development and in Vercel (Production, Preview, and Development as needed). The existing `VITE_SUPABASE_URL` is used for the project URL; `SUPABASE_URL` can be set instead. Keep privileged keys server-only and never add a `VITE_` prefix.

Seasonal guidance is generated only for saved route plans. Each saved route stores one consolidated guide in `saved_travel_routes.seasonal_guide`; the browser uses the existing Supabase public client to save and retrieve it. Apply `20261028000300_saved_route_seasonal_guides.sql` in Supabase before deploying this version. The migration adds the JSON guide column, preserves old per-stop guide data on matching routes for migration history, and drops `location_season_guides`.

The `error_logs_public_access` migration grants public read, insert, update, and delete access to this table. Anyone with the public Supabase API key can therefore access every error record.
