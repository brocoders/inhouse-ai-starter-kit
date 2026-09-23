import { defineCollection } from 'astro:content';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // The site is English only, like the apps built from the kit. The collection
  // is declared anyway so Starlight stops warning about it on every build, and
  // so that a second language is a folder rather than a change to the config.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
