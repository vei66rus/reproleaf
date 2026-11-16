import {assertMarkupSourceBudget,assertJsonSourceBudget,isWebUrl} from '../../markup-input-guards.mjs';
import {auditJsonLd} from '../../schema-audit.mjs';
import {auditSocialMeta} from '../../social-audit.mjs';
import {redactTextSecrets} from '../../sanitize-core.mjs';

export const MARKUP_LIMITS=Object.freeze({bytes:1048576,htmlNodes:20000,htmlDepth:128,jsonDepth:32,jsonNodes:10000,blocks:100,displayFindings:100});
const fail=code=>{throw new Error(code);};
export function inspectMarkupInput(text,{format='html',mode='jsonld-schema'}={}){
 if(!['jsonld-schema','social-meta'].includes(mode)||!['html','json'].includes(format)||(mode==='social-meta'&&format!=='html'))fail('MARKUP_MODE');
 if(typeof text!=='string'||!text.trim())fail('MARKUP_EMPTY');
 assertMarkupSourceBudget(text);
 let html=text;
 if(format==='json'){assertJsonSourceBudget(text);html='<script type="application/ld+json">'+text.replaceAll('<','\\u003c')+'</script>';}
 return {html,sourceBytes:new TextEncoder().encode(text).length,format};
}
const isHttpUrl=isWebUrl;
function sanitized(value){if(typeof value==='string')return redactTextSecrets(value,false);if(Array.isArray(value))return value.map(sanitized);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitized(v)]));return value;}
export function buildMarkupReview({mode='jsonld-schema',text,url='',format='html',encoding=null}){
 const source=inspectMarkupInput(text,{format,mode});
 if(url&&(!isHttpUrl(url)||url.length>2048))fail('MARKUP_URL');
 const report=(mode==='jsonld-schema'?auditJsonLd:auditSocialMeta)({html:source.html,...(url?{url}:{})});
 const findings=report.findings;
 const encodingKeys=['requested','selected','source','bom','headerCharset','metaCharset','metaInspection','fallbackUsed','byteLength','decodedUtf8Bytes','declarationScanBytes','declarationAdjustment','scope'];
 const sourceEncoding=encoding?Object.fromEntries(encodingKeys.filter(key=>Object.hasOwn(encoding,key)).map(key=>[key,typeof encoding[key]==='string'?encoding[key].slice(0,200):typeof encoding[key]==='number'&&Number.isFinite(encoding[key])?encoding[key]:typeof encoding[key]==='boolean'?encoding[key]:null])):{source:'javascript-string',selected:null,byteLength:null,decodedUtf8Bytes:source.sourceBytes,scope:'Already decoded text; charset declarations do not reinterpret supplied strings.'};
 const errors=findings.filter(f=>f.severity==='error').length,warnings=findings.filter(f=>f.severity==='warning').length;
 return sanitized({schemaVersion:1,tool:mode,ok:errors===0,url:url||null,summary:{...report.summary,errors,warnings},scope:{sourceBytes:source.sourceBytes,inputFormat:format,sourceEncoding,networkUsed:false,sourceHtmlIncluded:false,exportRedaction:'Known credentials and emails are redacted; URL credentials, query and fragment removed. Review all remaining text before sharing.',displayLimit:MARKUP_LIMITS.displayFindings,coverage:mode==='jsonld-schema'?'JSON syntax and a limited local structural profile, not full Schema.org validation, JSON-LD expansion, fact checking or Google rich result eligibility.':'Supplied meta tags only. No image download, HTTP validation, dimensions, cache refresh or actual social-platform rendering.'},...(mode==='jsonld-schema'?{blocks:report.blocks}:{openGraph:report.openGraph,twitter:report.twitter,preview:report.preview}),findings});
}
export function formatMarkupReviewCsv(report){const cell=value=>{let text=String(value??'');if(/^[\s\uFEFF]*[=+\-@]/u.test(text)||/^[\t\r\n]/u.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};return '\uFEFF'+[['code','severity','block','target','observation','next_step'],...report.findings.map(f=>[f.code,f.severity,f.blockIndex??'',f.target||f.tag||f.type||'',f.message,f.recommendation||''])].map(row=>row.map(cell).join(',')).join('\r\n');}

const ruFinding={
 SCHEMA_INVALID_WEB_URL:'В разметке указан некорректный или небезопасный веб-адрес.',SOCIAL_INVALID_PAGE_URL:'В метатеге или canonical указан некорректный адрес страницы.',SOCIAL_INVALID_IMAGE_URL:'Указан некорректный абсолютный HTTP(S) адрес изображения.',
 SCHEMA_RELATIVE_URL:'В разметке указан относительный адрес.',SCHEMA_INVALID_ENTITY:'Элемент JSON-LD должен быть объектом.',SCHEMA_CONTEXT_UNUSUAL:'Контекст Schema.org не найден.',SCHEMA_ARTICLE_MISSING_FIELD:'В профиле статьи не хватает поля для ручной проверки.',SCHEMA_INVALID_DATE:'Формат даты требует проверки.',SCHEMA_FAQ_EMPTY:'В FAQPage нет массива вопросов.',SCHEMA_FAQ_INCOMPLETE_ITEM:'В вопросе FAQ не хватает текста вопроса или ответа.',SCHEMA_BREADCRUMB_EMPTY:'Список хлебных крошек пуст.',SCHEMA_BREADCRUMB_INCOMPLETE_ITEM:'В хлебной крошке не хватает позиции или названия.',SCHEMA_SOFTWARE_MISSING_NAME:'В описании приложения нет названия.',SCHEMA_SOFTWARE_MISSING_CATEGORY:'Категория приложения или операционная система не указана.',SCHEMA_IDENTITY_MISSING_NAME:'В сущности Person/Organization нет названия.',SCHEMA_MISSING:'В переданном HTML не найдены JSON-LD блоки.',SCHEMA_EMPTY_BLOCK:'Найден пустой JSON-LD блок.',SCHEMA_INVALID_JSON:'Синтаксис JSON содержит ошибку.',SCHEMA_MISSING_TYPE:'У сущности не указан @type.',SCHEMA_DUPLICATE_ID:'Идентификатор @id объявлен несколько раз.',SCHEMA_UNRESOLVED_ID_REF:'Локальная ссылка @id требует ручной проверки.',SOCIAL_DUPLICATE_META:'Социальный метатег указан несколько раз.',SOCIAL_IMAGE_HTTP_NOT_HTTPS:'Адрес изображения использует HTTP.',SOCIAL_RELATIVE_IMAGE_URL:'Адрес изображения не является абсолютным HTTPS URL.',SOCIAL_MISSING_OG_TITLE:'Не указан og:title.',SOCIAL_MISSING_OG_DESCRIPTION:'Не указан og:description.',SOCIAL_MISSING_OG_IMAGE:'Не указан og:image.',SOCIAL_MISSING_OG_URL:'Не указан og:url.',SOCIAL_OG_URL_CANONICAL_MISMATCH:'og:url отличается от canonical.',SOCIAL_MISSING_OG_TYPE:'Не указан og:type.',SOCIAL_MISSING_TWITTER_CARD:'Не указан twitter:card.',SOCIAL_INVALID_TWITTER_CARD:'Значение twitter:card не входит в поддержанный список.',SOCIAL_SUMMARY_LARGE_IMAGE_NO_IMAGE:'Для карточки с большим изображением не указан адрес изображения.',SOCIAL_TITLE_TOO_LONG:'Заголовок карточки может быть обрезан.',SOCIAL_DESCRIPTION_TOO_LONG:'Описание карточки может быть обрезано.',MARKUP_INVALID_HTTP_URL:'Нужен корректный абсолютный HTTP(S) URL без пароля.',MARKUP_CONTEXT_UNVERIFIED:'Контекст выходит за пределы поддержанного профиля Schema.org.',MARKUP_INVALID_CALENDAR_DATE:'Указана невозможная календарная дата.'
};

export function markupFindingTitle(finding,language='en'){return language==='ru'?(ruFinding[finding.code]||'Наблюдение требует проверки.'):finding.message;}
