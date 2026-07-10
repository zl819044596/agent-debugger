import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://debug.getfitai.io',
  integrations: [mdx()],
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
