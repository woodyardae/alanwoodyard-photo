import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  output: 'static',
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  integrations: [tailwind()],
  devToolbar: {
    enabled: false,
  },
  vite: {
    plugins: [
      {
        name: 'merch-studio-api-router',
        configureServer(server) {
          server.middlewares.use('/api/approve-merch', (req, res) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', () => {
                try {
                  const { id, product, crop, watermark } = JSON.parse(body);
                  const manifestPath = path.resolve(`src/content/artworks/${id}.json`);
                  if (!fs.existsSync(manifestPath)) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Manifest not found: ${id}` }));
                    return;
                  }

                  const raw = fs.readFileSync(manifestPath, 'utf-8').replace(/^\uFEFF/, '');
                  const data = JSON.parse(raw);

                  if (!Array.isArray(data.merch_approved)) data.merch_approved = [];
                  if (!data.merch_approved.includes(product)) data.merch_approved.push(product);

                  if (!data.merch_crops) data.merch_crops = {};
                  data.merch_crops[product] = {
                    crop,
                    watermark,
                    approved_at: new Date().toISOString(),
                  };

                  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), 'utf-8');
                  console.log(`[MERCH APPROVED] ${id} -> ${product}`);

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, id, product }));
                } catch (err) {
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              res.writeHead(405).end();
            }
          });
        },
      },
    ],
  },
});