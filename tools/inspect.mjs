import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  console.log('=====', f);
  console.log('anims:', root.listAnimations().map(a => a.getName() + '(' + a.listChannels().length + ')').join(', '));
  console.log('meshes:', root.listMeshes().map(m => m.getName() + '[' + m.listPrimitives().length + ']').join(', '));
  console.log('materials:', root.listMaterials().map(m => m.getName() + ' tex:' + (m.getBaseColorTexture() ? 'Y' : 'n') + ' col:' + m.getBaseColorFactor().map(x=>x.toFixed(2))).join(' | '));
  console.log('skins:', root.listSkins().map(s => s.listJoints().length).join(','));
  const nodes = root.listNodes();
  console.log('nodes:', nodes.length);
  const top = root.listScenes()[0].listChildren();
  const pr = (n, d) => { if (d > 3 && !/Hips|Spine|Head|Arm|Leg|Foot|Hand$|Neck|Shoulder/.test(n.getName())) return; console.log(' '.repeat(d*2) + n.getName() + ' t=' + n.getTranslation().map(x=>x.toFixed(2)) + ' s=' + n.getScale().map(x=>x.toFixed(2)) + (n.getMesh() ? ' MESH' : '')); n.listChildren().forEach(c => { if (!/Hand.+\d|Toe_End|HeadTop/.test(c.getName())) pr(c, d+1); }); };
  top.forEach(n => pr(n, 0));
}
