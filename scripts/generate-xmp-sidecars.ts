import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_DIR = path.resolve('src/content/artworks');
const SOURCE_DIR = path.resolve('assets/source-masters');

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function buildXmp(data: any): string {
  const title = escapeXml(data.title || '');
  const headline = escapeXml(data.caption || '');
  const description = escapeXml(data.description || data.caption || '');
  const date = data.capture?.date || new Date().toISOString().split('T')[0];
  const location = escapeXml(data.capture?.location || '');

  const tagSet = new Set<string>();
  if (Array.isArray(data.tags)) data.tags.forEach((t: string) => tagSet.add(t));
  if (Array.isArray(data.collections)) data.collections.forEach((c: string) => tagSet.add(c));
  if (data.mood && data.mood !== 'all') tagSet.add(data.mood);

  const keywordsArray = Array.from(tagSet).map(escapeXml);
  const keywordsXml = keywordsArray.map((k) => `          <rdf:li>${k}</rdf:li>`).join('\n');

  const hierarchical: string[] = [];
  if (Array.isArray(data.collections)) {
    data.collections.forEach((c: string) => hierarchical.push(`Collections|${escapeXml(c)}`));
  }
  if (data.mood && data.mood !== 'all') {
    hierarchical.push(`Mood|${escapeXml(data.mood)}`);
  }
  const hierarchicalXml = hierarchical.map((h) => `          <rdf:li>${h}</rdf:li>`).join('\n');

  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="XMP Core 5.6.0">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
        xmlns:lr="http://ns.adobe.com/lightroom/1.0/">
      <dc:title>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${title}</rdf:li>
        </rdf:Alt>
      </dc:title>
      <dc:description>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">${description}</rdf:li>
        </rdf:Alt>
      </dc:description>
      <photoshop:Headline>${headline}</photoshop:Headline>
      <dc:creator>
        <rdf:Seq>
          <rdf:li>Alan Woodyard</rdf:li>
        </rdf:Seq>
      </dc:creator>
      <dc:rights>
        <rdf:Alt>
          <rdf:li xml:lang="x-default">© Alan Woodyard. All rights reserved.</rdf:li>
        </rdf:Alt>
      </dc:rights>
      <xmpRights:Marked>True</xmpRights:Marked>
      <photoshop:Credit>Alan Woodyard Fine Art</photoshop:Credit>
      <xmp:CreateDate>${date}</xmp:CreateDate>
${location ? `      <photoshop:City>${location}</photoshop:City>\n` : ''}      <dc:subject>
        <rdf:Bag>
${keywordsXml}
        </rdf:Bag>
      </dc:subject>
${hierarchical.length > 0 ? `      <lr:hierarchicalSubject>
        <rdf:Bag>
${hierarchicalXml}
        </rdf:Bag>
      </lr:hierarchicalSubject>\n` : ''}    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function run() {
  const manifests = fs.readdirSync(MANIFEST_DIR).filter((f) => f.endsWith('.json'));

  for (const mf of manifests) {
    const raw = fs.readFileSync(path.join(MANIFEST_DIR, mf), 'utf-8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);

    if (!data.master_file) continue;
    const masterAbsPath = path.resolve(data.master_file);
    if (!fs.existsSync(masterAbsPath)) continue;

    const parsed = path.parse(masterAbsPath);
    const xmpContent = buildXmp(data);
    
    fs.writeFileSync(path.join(parsed.dir, `${parsed.name}.xmp`), xmpContent, 'utf-8');
    fs.writeFileSync(path.join(parsed.dir, `${parsed.base}.xmp`), xmpContent, 'utf-8');
  }

  console.log(`Synchronized XMP sidecars for ${manifests.length} items.`);
}

run();