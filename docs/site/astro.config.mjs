// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import starlightLinksValidator from 'starlight-links-validator';
import { remarkDocLinks } from './scripts/remark-doc-links.mjs';

// GitHub Pages serves a project site from a folder, so every address on this
// site starts with `base`. Nothing below writes that prefix by hand: Starlight's
// own links and Astro's relative Markdown links both add it, which is why the
// guides link to `../reference/running.md` and never to `/reference/running/`.
const site = 'https://brocoders.github.io';
const base = '/inhouse-ai-starter-kit';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  vite: {
    // Mermaid is one large chunk by nature and is fetched only by a page that
    // draws a diagram. The default 500 kB notice is not telling us anything.
    build: { chunkSizeWarningLimit: 1500 },
  },
  markdown: {
    // `[Costs](./costs.mdx)` becomes `/inhouse-ai-starter-kit/guides/costs/`.
    remarkPlugins: [[remarkDocLinks, { base }]],
  },
  integrations: [
    // Before starlight(), which is what the astro-mermaid readme requires: it
    // has to see the ```mermaid code blocks before Starlight's own Markdown
    // handling turns them into highlighted code.
    mermaid({ theme: 'neutral', autoTheme: true }),
    starlight({
      title: 'InHouse',
      description:
        "The creator's guide to the InHouse AI Starter Kit: build your company's own tools with AI.",
      logo: { src: './src/assets/icon.svg', alt: 'InHouse' },
      favicon: '/icon.svg',
      customCss: ['./src/styles/custom.css'],
      lastUpdated: false,
      pagination: true,
      editLink: {
        baseUrl: 'https://github.com/brocoders/inhouse-ai-starter-kit/edit/main/docs/site/',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/brocoders/inhouse-ai-starter-kit',
        },
      ],
      plugins: [
        // The build fails on a link that points nowhere. A guide that sends a
        // reader to a page that does not exist is worse than no guide.
        starlightLinksValidator({ errorOnRelativeLinks: false, errorOnInvalidHashes: true }),
      ],
      sidebar: [
        { label: 'Start here', link: '/guides/start-here/' },
        { label: 'Your first hour', link: '/guides/first-hour/' },
        { label: 'Your first real screen', link: '/guides/first-screen/' },
        { label: 'Working day to day', link: '/guides/day-to-day/' },
        { label: 'Publishing to your server', link: '/guides/publishing/' },
        { label: 'What is built in', link: '/guides/built-in/' },
        { label: 'When something breaks', link: '/guides/when-something-breaks/' },
        { label: 'Costs', link: '/guides/costs/' },
        { label: 'Recipes', items: [{ autogenerate: { directory: 'recipes' } }] },
        // The glossary is one of the synced reference pages; it earns a place of
        // its own in the sidebar because every guide sends people to it.
        { label: 'Glossary', link: '/reference/glossary/' },
        {
          label: 'Reference',
          collapsed: true,
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
});
