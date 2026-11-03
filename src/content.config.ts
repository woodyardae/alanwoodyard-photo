import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { artworkSchema } from './content/schema';

export * from './content/schema';

const artworks = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/artworks' }),
  schema: artworkSchema
});

export const collections = {
  artworks
};
