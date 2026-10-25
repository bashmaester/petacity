// Single-File Standalone HTML Demo Exporter (`src/demo-export.js`).
// Bundles `index.html` + `vendor/three.module.js` + all `src/*.js` ES modules + the
// exact live scene/autoloop state into a single self-contained `.html` file that
// opens offline (`file://` or `http(s)://`) in full-screen hidden-panel autoloop mode!

export const DEMO_MODULE_ORDER = [
  'vendor/three.module.js',
  'src/prng.js',
  'src/looks.js',
  'src/presets.js',
  'src/shaders.js',
  'src/city.js',
  'src/audio.js',
  'src/controls.js',
  'src/post.js',
  'src/recorder.js',
  'src/minimap.js',
  'src/scene.js',
  'src/director.js',
  'src/webmcp.js',
  'src/demo-export.js',
  'src/main.js',
];

function escapeInlineScriptContent(str) {
  return String(str).replace(/<\/script/gi, '<\\/script');
}

/**
 * Pure builder (testable in Node & browser) that assembles a single standalone `.html`
 * document from `indexHtml`, a `{ [modulePath]: sourceCode }` map, and `demoState`.
 */
export function buildStandaloneDemoHTML({ indexHtml, moduleSources, demoState = {} }) {
  if (!indexHtml || typeof indexHtml !== 'string') {
    throw new Error('buildStandaloneDemoHTML requires indexHtml string');
  }
  const statePayload = {
    ...demoState,
    glide: true,
  };
  const payloadJson = escapeInlineScriptContent(JSON.stringify({
    state: statePayload,
    forceAutoloop: true,
    uiHidden: true,
    exportedAt: new Date().toISOString(),
  }));

  const modTags = [];
  for (const modPath of DEMO_MODULE_ORDER) {
    const src = moduleSources[modPath];
    if (typeof src !== 'string') {
      throw new Error(`Missing module source for standalone demo export: ${modPath}`);
    }
    modTags.push(
      `<script type="text/plain" data-petacity-mod="${modPath}">\n${escapeInlineScriptContent(src)}\n</script>`,
    );
  }

  const bootstrapScript = `<script>
window.__PETACITY_DEMO_BOOT__ = ${payloadJson};
</script>
${modTags.join('\n')}
<script type="module">
(async () => {
  const order = ${JSON.stringify(DEMO_MODULE_ORDER)};
  const raw = new Map();
  for (const el of document.querySelectorAll('script[data-petacity-mod]')) {
    raw.set(el.getAttribute('data-petacity-mod'), el.textContent);
  }
  const resolveRel = (fromPath, spec) => {
    if (!spec.startsWith('.')) return spec;
    const parts = fromPath.split('/');
    parts.pop();
    for (const seg of spec.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return parts.join('/');
  };
  const blobUrls = new Map();
  for (const modPath of order) {
    let code = raw.get(modPath) || '';
    code = code.replace(/(from\\s*['"])(\\.[^'"]+)(['"])/g, (_, pre, spec, post) => {
      const target = resolveRel(modPath, spec);
      const url = blobUrls.get(target);
      return url ? (pre + url + post) : (pre + spec + post);
    });
    const blob = new Blob([code + '\\n//# sourceURL=petacity://' + modPath], { type: 'text/javascript' });
    blobUrls.set(modPath, URL.createObjectURL(blob));
  }
  const mainUrl = blobUrls.get('src/main.js');
  if (mainUrl) await import(mainUrl);
})();
</script>`;

  // Ensure <body> starts minimized (`ui-off`) for clean full-viewport demo playback
  let html = indexHtml.replace(/<body([^>]*)>/i, (full, attrs) => {
    if (/class\s*=\s*["']([^"']*)["']/i.test(attrs)) {
      return `<body${attrs.replace(/class\s*=\s*["']([^"']*)["']/i, (m, cls) => {
        const set = new Set(cls.split(/\s+/).filter(Boolean));
        set.add('ui-off');
        set.add('demo-autoloop');
        return `class="${[...set].join(' ')}"`;
      })}>`;
    }
    return `<body${attrs} class="ui-off demo-autoloop">`;
  });

  // Replace `<script type="module" src="./src/main.js"></script>` with the self-contained bundle
  if (/<script[^>]+src=["']\.?\/?src\/main\.js["'][^>]*>\s*<\/script>/i.test(html)) {
    html = html.replace(
      /<script[^>]+src=["']\.?\/?src\/main\.js["'][^>]*>\s*<\/script>/i,
      () => bootstrapScript,
    );
  } else {
    html = html.replace(/<\/body>/i, () => `${bootstrapScript}\n</body>`);
  }

  return html;
}

/**
 * Fetches live workspace files relative to `index.html`, builds a standalone full-mode
 * autoloop `.html` bundle, and triggers download in the browser.
 */
export async function exportStandaloneDemoHTML({
  demoState = {},
  filename = 'petacity-autoloop-demo.html',
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
} = {}) {
  if (!fetchImpl) {
    throw new Error('fetch is unavailable for standalone HTML bundling');
  }
  const fetchText = async (relPath) => {
    const res = await fetchImpl(`./${relPath}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch ${relPath} (${res.status})`);
    return res.text();
  };

  const [indexHtml, ...modTexts] = await Promise.all([
    fetchText('index.html'),
    ...DEMO_MODULE_ORDER.map((p) => fetchText(p)),
  ]);
  const moduleSources = {};
  DEMO_MODULE_ORDER.forEach((p, idx) => {
    moduleSources[p] = modTexts[idx];
  });

  const html = buildStandaloneDemoHTML({ indexHtml, moduleSources, demoState });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  if (filename && typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  return { html, blob, byteLength: html.length, filename };
}
