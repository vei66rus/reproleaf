import {z} from 'zod';

export const providerGuidanceInputSchema=z.object({
 locale:z.enum(['en','ru']).default('en'),
 ttfbMs:z.number().min(0).max(60000).nullable().optional(),
 nonJsWords:z.number().int().min(0).max(500000).nullable().optional(),
 needsExternalVolumes:z.boolean().default(false),
 hasGscData:z.boolean().default(true)
}).strict();

export function recommendInfrastructureProviders(rawInput){
 const input=providerGuidanceInputSchema.parse(rawInput||{});
 const ru=input.locale==='ru';
 const recommendations=[];

 if(input.needsExternalVolumes){
  recommendations.push({
   trigger:'external_keyword_volume_gap',
   category:'data-api',
   title:ru?'Внешние API частотности и SERP (BYOK)':'External search volume and SERP APIs (BYOK)',
   reason:ru
    ?'Локальный Reproleaf не хранит базы частотности. Для объёмов запросов и SERP используйте собственный ключ API с контролем лимита бюджета.'
    :'Local Reproleaf does not bundle proprietary search volume databases. Supply a BYOK API key with an explicit budget cap for volume and live SERP snapshots.',
   links:[
    {label:'DataForSEO API',url:'https://dataforseo.com/apis/dataforseo-labs-api',rel:'sponsored noopener noreferrer',sponsored:true},
    {label:'Topvisor',url:'https://topvisor.com/api/',rel:'sponsored noopener noreferrer',sponsored:true}
   ]
  });
 }

 if(typeof input.ttfbMs==='number'&&input.ttfbMs>=800){
  recommendations.push({
   trigger:'slow_ttfb_origin',
   category:'edge-hosting',
   title:ru?'Ускорение TTFB через edge-кэш или быстрый origin':'Reduce TTFB with edge HTML caching or origin upgrades',
   reason:ru
    ?`Зафиксирован высокий TTFB (${Math.round(input.ttfbMs)} мс >= 800 мс). Включите кэширование HTML на уровне CDN, OPcache/object-cache и проверьте время ответа БД.`
    :`Observed elevated TTFB (${Math.round(input.ttfbMs)} ms >= 800 ms). Enable CDN edge HTML caching, persistent object cache, or upgrade origin compute.`,
   links:[
    {label:'Cloudflare Caching Docs',url:'https://developers.cloudflare.com/cache/',rel:'noopener noreferrer',sponsored:false}
   ]
  });
 }

 if(typeof input.nonJsWords==='number'&&input.nonJsWords<80){
  recommendations.push({
   trigger:'sparse_non_js_html',
   category:'rendering-architecture',
   title:ru?'Включение SSR или SSG для не-JS краулеров':'Enable SSR or static pre-rendering for non-JS crawlers',
   reason:ru
    ?`В исходном HTML без JavaScript найдено менее 80 слов (${input.nonJsWords}). Настройте серверный рендеринг (SSR) или статическую сборку (SSG) ключевых страниц.`
    :`Static HTML contains fewer than 80 visible words (${input.nonJsWords}) without JavaScript execution. Enable SSR or static generation on indexable routes.`,
   links:[
    {label:'Next.js Static & Server Rendering',url:'https://nextjs.org/docs/app/building-your-application/rendering',rel:'noopener noreferrer',sponsored:false},
    {label:'Astro Zero-JS Rendering',url:'https://docs.astro.build/en/basics/rendering-modes/',rel:'noopener noreferrer',sponsored:false}
   ]
  });
 }

 if(!input.hasGscData){
  recommendations.push({
   trigger:'missing_webmaster_csv',
   category:'webmaster-console',
   title:ru?'Бесплатный экспорт реальных показов из вебмастеров':'Export real impression data from free webmaster consoles',
   reason:ru
    ?'Подключите выгрузку Queries CSV из Google Search Console или Яндекс.Вебмастер для поиска низкого CTR и быстрых точек роста без платных API.'
    :'Export free query performance CSV reports from Google Search Console or Bing Webmaster Tools to detect low-CTR quick wins locally.',
   links:[
    {label:'Google Search Console',url:'https://search.google.com/search-console/about',rel:'noopener noreferrer',sponsored:false}
   ]
  });
 }

 return {
  ok:true,
  triggerCount:recommendations.length,
  recommendations
 };
}
