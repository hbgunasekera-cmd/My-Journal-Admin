# My Journal Admin Console

Admin console for managing My Journal travel locations, route plans, articles, social sharing, and audience activity.

## Development

- `npm install` installs dependencies.
- `npm run dev` starts the Vite development server.
- `npm run build` creates a production build.
- `npm run lint` checks the application with ESLint.

The frontend expects `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`. Optional integrations use `VITE_MAPS_KEY` and `VITE_WEATHER_KEY`. Serverless integrations are configured through the environment variables referenced in `api/`.
