import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';

export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://lanej.io',
  base: process.env.GITHUB_PAGES === 'true' ? '/wirelit' : '/',
  markdown: { processor: unified({ remarkPlugins: [baseLinks] }) },
  vite: { server: { allowedHosts: ['terminal.local'] } },
  integrations: [starlight({
    title: 'Wirelit',
    logo: { src: './src/assets/wirelit.svg', replacesTitle: false },
    description: 'An ordinary documentation site, with a generated Connect API reference.',
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/lanej/wirelit' }],
    customCss: ['./src/styles/custom.css'],
    sidebar: [
      { label: 'Start here', items: [
        { label: 'Introduction', slug: '' },
        { label: 'Add to your docs', slug: 'getting-started' },
      ] },
      { label: 'Application guides', items: [{ autogenerate: { directory: 'guides' } }] },
      { label: 'Protocol', items: [{ autogenerate: { directory: 'protocol' } }] },
      { label: 'API reference', items: [
        { slug: 'reference/api' },
        { label: 'Shipment service', items: [
          { slug: 'reference/api/services/shipping-v1-shipmentservice' },
          { autogenerate: { directory: 'reference/api/services/shipping-v1-shipmentservice' } },
        ] },
        { label: 'Messages and enums', collapsed: true, items: [
          { autogenerate: { directory: 'reference/api/types' } },
        ] },
      ] },
    ],
  })],
});

// This host site controls its deployment base, including links in authored MDX.
function baseLinks() {
  const base = process.env.GITHUB_PAGES === 'true' ? '/wirelit' : '';
  const rewrite = value => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(base + '/') ? base + value : value;
  return tree => {
    function walk(node) {
      if (node.type === 'link') node.url = rewrite(node.url);
      for (const attr of Array.isArray(node.attributes) ? node.attributes : []) if (attr.name === 'href') attr.value = rewrite(attr.value);
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree);
  };
}
