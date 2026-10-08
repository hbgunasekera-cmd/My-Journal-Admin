import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const localArticleApi = {
  name: 'local-article-api',
  configureServer(server) {
    server.middlewares.use('/api/generate-article', async (request, response, next) => {
      if (request.method !== 'POST') {
        response.statusCode = 405;
        response.setHeader('Allow', 'POST');
        response.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }

      try {
        const chunks = [];
        let length = 0;
        for await (const chunk of request) {
          length += chunk.length;
          if (length > 100_000) {
            response.statusCode = 413;
            response.end(JSON.stringify({ error: 'Generation request is too large.' }));
            return;
          }
          chunks.push(chunk);
        }

        try {
          request.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Request body must be valid JSON.' }));
          return;
        }

        response.status = (statusCode) => {
          response.statusCode = statusCode;
          return response;
        };
        response.json = (body) => {
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(body));
          return response;
        };

        const { default: handler } = await import('./api/generate-article.js');
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    });
  }
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const localArticleEnv = loadEnv(mode, process.cwd(), 'ARTICLE_KEY');
  if (!process.env.ARTICLE_KEY && localArticleEnv.ARTICLE_KEY) {
    process.env.ARTICLE_KEY = localArticleEnv.ARTICLE_KEY;
  }

  return {
    // Only values explicitly needed in browser code are exposed by Vite.
    envPrefix: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY', 'VITE_MAPS_KEY', 'VITE_WEATHER_KEY'],
    plugins: [
      react(),
      basicSsl(),
      localArticleApi
    ],
    server: {
      // Ensures --host is always active so you can access it via your mobile phone IP
      host: true,
    }
  };
})
