export function importSitemap(xml,Parser=globalThis.DOMParser){
 if(typeof xml!=='string'||xml.length>5*1048576)throw Error('Sitemap exceeds 5 MiB.');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD and entity declarations are not supported.');
 const doc=new Parser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Invalid XML.');
 const root=doc.documentElement,ns='http://www.sitemaps.org/schemas/sitemap/0.9';
 if(root.localName==='sitemapindex')throw Error('This is a sitemap index. Upload a child URL sitemap (urlset), not the index.');
 if(root.localName!=='urlset'||root.namespaceURI!==ns)throw Error('Expected a standard sitemap urlset.');
 const entries=[...root.children].filter(e=>e.localName==='url'&&e.namespaceURI===ns);
 if(!entries.length||entries.length>1000)throw Error('Upload between 1 and 1000 page URLs.');
 const urls=entries.map(entry=>{const loc=[...entry.children].filter(e=>e.localName==='loc'&&e.namespaceURI===ns);if(loc.length!==1)throw Error('Each URL needs one loc.');const raw=loc[0].textContent.trim();if(raw.length>2048)throw Error('URL exceeds 2048 characters.');const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Only public HTTP(S) URL syntax is supported.');u.hash='';return u;});
 const origin=urls[0].origin;if(urls.some(u=>u.origin!==origin))throw Error('Use one site origin per sitemap.');
 const pages=[...new Set(urls.map(u=>u.href))].map(url=>({url,title:new URL(url).pathname,kind:'other',textScope:'unknown',links:[]}));
 return {schemaVersion:1,siteUrl:origin,evidenceScope:'urls-only',coverage:'Uploaded XML sitemap: URL inventory only. No pages fetched; no content, stored hyperlinks, backlink or indexation evidence.',pages};
}
