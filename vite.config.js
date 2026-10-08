import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { readdirSync } from "node:fs";

const localApiNames = new Set(
  readdirSync(new URL("./api/", import.meta.url))
    .filter((fileName) => fileName.endsWith(".js"))
    .map((fileName) => fileName.slice(0, -3)),
);

const localApi = {
  name: "local-api-handlers",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const apiMatch = requestUrl.pathname.match(/^\/api\/([a-z0-9-]+)\/?$/);
      if (!apiMatch) return next();

      const [, handlerName] = apiMatch;
      if (!localApiNames.has(handlerName)) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ error: "API route not found." }));
        return;
      }

      try {
        request.query = Object.fromEntries(requestUrl.searchParams.entries());
        request.body = {};

        if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
          const chunks = [];
          let length = 0;
          for await (const chunk of request) {
            length += chunk.length;
            if (length > 2_000_000) {
              response.statusCode = 413;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "Request body is too large." }));
              return;
            }
            chunks.push(chunk);
          }

          if (length > 0) {
            try {
              request.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } catch {
              response.statusCode = 400;
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify({ error: "Request body must be valid JSON." }));
              return;
            }
          }
        }

        response.status = (statusCode) => {
          response.statusCode = statusCode;
          return response;
        };
        response.json = (body) => {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify(body));
          return response;
        };
        response.send = (body) => {
          response.end(body);
          return response;
        };

        const { default: handler } = await import(`./api/${handlerName}.js`);
        await handler(request, response);
      } catch (error) {
        next(error);
      }
    });
  },
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const localArticleEnv = loadEnv(mode, process.cwd(), "ARTICLE_KEY");
  if (!process.env.ARTICLE_KEY && localArticleEnv.ARTICLE_KEY) {
    process.env.ARTICLE_KEY = localArticleEnv.ARTICLE_KEY;
  }

  return {
    // Only values explicitly needed in browser code are exposed by Vite.
    envPrefix: [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_KEY",
      "VITE_MAPS_KEY",
      "VITE_WEATHER_KEY",
    ],
    plugins: [
      react(),
      // Automatically generates local SSL certificates for HTTPS network testing
      basicSsl(),
      localApi,
    ],
    server: {
      // Ensures --host is always active so you can access it via your mobile phone IP
      host: true,
    },
  };
});
