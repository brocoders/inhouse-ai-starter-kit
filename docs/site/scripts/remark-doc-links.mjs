// Let a page link to another page by its file name.
//
// Every address on this site starts with `base`, because GitHub Pages serves it
// from a folder. Writing that prefix into sixty links by hand is how one of
// them ends up wrong, so the guides link the way the repository's own Markdown
// does — `[Costs](./costs.mdx)` — and this plugin turns that into the real
// address, prefix and all, while the page is being built.
//
// It also refuses to build when the file a link names does not exist. A link
// that points nowhere is caught here, by name, rather than as a 404 somebody
// finds later.

import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';

const docsRoot = fileURLToPath(new URL('../src/content/docs/', import.meta.url));

/** A file's path under src/content/docs becomes the address Starlight serves. */
function addressFor(target, base) {
  const withoutExtension = relative(docsRoot, target).replace(/\.mdx?$/, '');
  const segments = withoutExtension.split('/').filter((part) => part && part !== 'index');
  const prefix = base.replace(/\/$/, '');
  return segments.length ? `${prefix}/${segments.join('/')}/` : `${prefix}/`;
}

export function remarkDocLinks({ base = '/' } = {}) {
  return function transform(tree, file) {
    visit(tree, 'link', (node) => {
      const match = /^(\.{1,2}\/[^#?]*\.mdx?)(#.*)?$/.exec(node.url);
      if (!match) return;
      const [, relativePath, anchor = ''] = match;
      const target = resolve(dirname(file.path), relativePath);
      if (!existsSync(target)) {
        throw new Error(
          `${relative(docsRoot, file.path)} links to ${node.url}, and that file does not exist`,
        );
      }
      node.url = addressFor(target, base) + anchor;
    });
  };
}
