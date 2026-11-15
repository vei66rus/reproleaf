import {z} from 'zod';

const httpUrlSchema=z.string().url().max(2048).refine(u=>{
 const protocol=new URL(u).protocol;
 return protocol==='http:'||protocol==='https:';
},{message:'URL must use http or https'});

export const fixGeneratorSchema=z.object({
 url:httpUrlSchema,
 title:z.string().trim().min(1).max(300),
 description:z.string().trim().min(1).max(600).optional(),
 h1:z.string().trim().min(1).max(300).optional(),
 author:z.string().trim().min(1).max(160).optional(),
 datePublished:z.string().trim().min(4).max(40).optional(),
 dateModified:z.string().trim().min(4).max(40).optional(),
 image:httpUrlSchema.optional(),
 siteName:z.string().trim().min(1).max(120).optional(),
 locale:z.string().trim().min(2).max(20).optional(),
 type:z.enum(['Article','FAQPage','SoftwareApplication']).default('Article'),
 faq:z.array(z.object({
  q:z.string().trim().min(1).max(400),
  a:z.string().trim().min(1).max(2000)
 }).strict()).max(50).optional()
}).strict();

function escapeHtml(text){
 return text
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');
}

function serializeJsonLd(obj){
 return JSON.stringify(obj,null,2).replace(/</g,'\\u003c');
}

export function suggestSeoFixes(rawInput){
 const input=fixGeneratorSchema.parse(rawInput);
 const warnings=[];

 if(input.title.length>60){
  warnings.push({
   code:'title-too-long',
   message:`Title is ${input.title.length} characters; keep under 60 characters to reduce SERP truncation.`
  });
 }
 if(!input.description){
  warnings.push({
   code:'missing-description',
   message:'No description was provided; meta description and og:description tags were omitted rather than invented.'
  });
 }else if(input.description.length>160){
  warnings.push({
   code:'description-too-long',
   message:`Description is ${input.description.length} characters; keep under 160 characters to reduce SERP truncation.`
  });
 }

 const headLines=[
  `<title>${escapeHtml(input.title)}</title>`,
  `<link rel="canonical" href="${escapeHtml(input.url)}">`,
  `<meta property="og:type" content="${input.type==='Article'?'article':'website'}">`,
  `<meta property="og:title" content="${escapeHtml(input.title)}">`,
  `<meta property="og:url" content="${escapeHtml(input.url)}">`,
  `<meta name="twitter:card" content="${input.image?'summary_large_image':'summary'}">`,
  `<meta name="twitter:title" content="${escapeHtml(input.title)}">`
 ];

 if(input.description){
  headLines.splice(1,0,`<meta name="description" content="${escapeHtml(input.description)}">`);
  headLines.push(`<meta property="og:description" content="${escapeHtml(input.description)}">`);
  headLines.push(`<meta name="twitter:description" content="${escapeHtml(input.description)}">`);
 }
 if(input.siteName){
  headLines.push(`<meta property="og:site_name" content="${escapeHtml(input.siteName)}">`);
 }
 if(input.locale){
  headLines.push(`<meta property="og:locale" content="${escapeHtml(input.locale)}">`);
 }
 if(input.image){
  headLines.push(`<meta property="og:image" content="${escapeHtml(input.image)}">`);
  headLines.push(`<meta name="twitter:image" content="${escapeHtml(input.image)}">`);
 }

 const jsonLdObjects=[];

 if(input.type==='Article'){
  const article={
   '@context':'https://schema.org',
   '@type':'Article',
   headline:input.h1||input.title,
   url:input.url,
   mainEntityOfPage:{'@type':'WebPage','@id':input.url}
  };
  if(input.description)article.description=input.description;
  if(input.author)article.author={'@type':'Person',name:input.author};
  if(input.datePublished)article.datePublished=input.datePublished;
  if(input.dateModified)article.dateModified=input.dateModified;
  if(input.image)article.image=input.image;
  jsonLdObjects.push(article);
 }else if(input.type==='SoftwareApplication'){
  const app={
   '@context':'https://schema.org',
   '@type':'SoftwareApplication',
   name:input.h1||input.title,
   url:input.url
  };
  if(input.description)app.description=input.description;
  if(input.author)app.author={'@type':'Organization',name:input.author};
  if(input.datePublished)app.datePublished=input.datePublished;
  if(input.dateModified)app.dateModified=input.dateModified;
  if(input.image)app.image=input.image;
  jsonLdObjects.push(app);
 }else if(input.type==='FAQPage'){
  if(!input.faq||input.faq.length===0){
   warnings.push({
    code:'missing-faq-items',
    message:'type is FAQPage but no faq items were provided; FAQPage JSON-LD was omitted.'
   });
  }else{
   jsonLdObjects.push({
    '@context':'https://schema.org',
    '@type':'FAQPage',
    url:input.url,
    mainEntity:input.faq.map(item=>({
     '@type':'Question',
     name:item.q,
     acceptedAnswer:{'@type':'Answer',text:item.a}
    }))
   });
  }
 }

 if(input.type!=='FAQPage'&&input.faq&&input.faq.length>0){
  jsonLdObjects.push({
   '@context':'https://schema.org',
   '@type':'FAQPage',
   url:input.url,
   mainEntity:input.faq.map(item=>({
    '@type':'Question',
    name:item.q,
    acceptedAnswer:{'@type':'Answer',text:item.a}
   }))
  });
 }

 const jsonLdScripts=jsonLdObjects.map(
  obj=>`<script type="application/ld+json">\n${serializeJsonLd(obj)}\n</script>`
 );

 const headHtml=headLines.join('\n');
 const fullHeadSnippet=[headHtml,...jsonLdScripts].join('\n');

 return {
  ok:true,
  summary:{
   type:input.type,
   titleLength:input.title.length,
   descriptionLength:input.description?input.description.length:0,
   metaTagCount:headLines.length,
   jsonLdBlockCount:jsonLdObjects.length,
   warningCount:warnings.length
  },
  snippets:{
   headHtml,
   jsonLd:jsonLdObjects,
   jsonLdScripts,
   fullHeadSnippet
  },
  warnings
 };
}
