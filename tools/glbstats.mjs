import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  let verts = 0, tris = 0;
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) { verts += p.getAttribute('POSITION').getCount(); const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
  const tex = r.listTextures().map(t => `${t.getMimeType()} ${t.getSize()} ${(t.getImage().byteLength/1024).toFixed(0)}KB`);
  let animBytes = 0; for (const a of r.listAnimations()) for (const s of a.listSamplers()) animBytes += s.getInput().getArray().byteLength + s.getOutput().getArray().byteLength;
  console.log(f, { verts, tris, tex, animKB: (animBytes/1024).toFixed(0) });
}
