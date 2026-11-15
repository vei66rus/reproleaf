function escapeXml(text){
 return String(text??'')
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&apos;');
}

function estimateWidth(text){
 return Math.max(44,Math.round(String(text||'').length*6.4+16));
}

export function generateBadgeSvg({label='GEO & SEO',status='checked by Reproleaf',color='#2e8b57'}={}){
 const safeColor=/^#[0-9a-fA-F]{3,8}$/.test(String(color||''))?color:'#2e8b57';
 const leftText=String(label).slice(0,40);
 const rightText=String(status).slice(0,50);
 const leftWidth=estimateWidth(leftText);
 const rightWidth=estimateWidth(rightText);
 const totalWidth=leftWidth+rightWidth;
 const leftCenter=Math.round(leftWidth/2);
 const rightCenter=leftWidth+Math.round(rightWidth/2);
 const aria=escapeXml(`${leftText}: ${rightText}`);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${aria}"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-opacity=".12"/></linearGradient><clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${leftWidth}" height="20" fill="#18181b"/><rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${safeColor}"/><rect width="${totalWidth}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${leftCenter}" y="14">${escapeXml(leftText)}</text><text x="${rightCenter}" y="14">${escapeXml(rightText)}</text></g></svg>\n`;
}

export function buildBadgeMarkdownSnippet({
 badgeUrl='https://raw.githubusercontent.com/vei66rus/reproleaf/main/badges/geo-seo-checked.svg',
 targetUrl='https://evolkov.tech/en/tools/geo-readiness-checker/',
 alt='GEO & SEO Checked by Reproleaf'
}={}){
 const safeAlt=String(alt).replace(/[\[\]]/g,'');
 return `[![${safeAlt}](${badgeUrl})](${targetUrl})`;
}
