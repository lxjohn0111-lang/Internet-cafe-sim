// Every asset is imported through Vite so the production build can embed it into a single
// self-contained index.html (data: URIs). Binary data is decoded in JS instead of fetched,
// which also keeps working under strict CSPs.
const files = import.meta.glob('./assets/**/*.{glb,webp}', { eager: true, query: '?url', import: 'default' });

export function assetUrl(p) {
  const u = files['./assets/' + p];
  if (!u) throw new Error('Missing asset: ' + p);
  return u;
}

export async function assetBuffer(p) {
  const u = assetUrl(p);
  if (u.startsWith('data:')) {
    const bin = atob(u.slice(u.indexOf(',') + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }
  const r = await fetch(u);
  return r.arrayBuffer();
}
