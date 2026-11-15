import {auditSerpSnippet} from '../../serp-snippet-audit.mjs';
import {suggestSeoFixes} from '../../fix-generator.mjs';
import {el,createToolFrame,renderMetrics,renderFindings,emitToolEvent,copyText,downloadText} from '../tool-shell.mjs';

const copy={
 ru:{
  title:'SERP Pixel Preview и генератор мета-тегов',
  subtitle:'Проверьте ширину title и description в пикселях для Desktop и Mobile, посмотрите превью сниппета и заберите готовые HTML и JSON-LD теги.',
  mode:'Сниппет + фиксы',
  exampleBtn:'Заполнить пример',
  urlLabel:'URL страницы',
  titleLabel:'Мета-заголовок (title)',
  descLabel:'Мета-описание (description)',
  h1Label:'H1 (необязательно)',
  queryLabel:'Основной запрос (необязательно)',
  authorLabel:'Автор (необязательно, для Article JSON-LD)',
  schemaLabel:'Тип Schema.org',
  runBtn:'Проверить сниппет и собрать теги',
  copyBtn:'Скопировать <head> + JSON-LD',
  copiedBtn:'Скопировано',
  downloadBtn:'Скачать JSON',
  doneOk:'Сниппет в пределах лимитов. Готовые теги сформированы.',
  doneWarn:'Есть замечания по длине или охвату запроса.',
  missing:'Укажите title или description.',
  mTitlePx:'Ширина Title (px)',
  mTitleChars:'Символов Title',
  mDescPx:'Ширина Description (px)',
  mDescChars:'Символов Description',
  desktopHeading:'Предпросмотр Desktop (580 / 920 px)',
  mobileHeading:'Предпросмотр Mobile (520 / 680 px)',
  snippetHeading:'Готовый фрагмент <head> + JSON-LD',
  noFixUrl:'Укажите корректный http/https URL, чтобы сгенерировать canonical и JSON-LD.'
 },
 en:{
  title:'SERP Pixel Preview & Meta Fixer',
  subtitle:'Measure title and description width in pixels for Desktop and Mobile SERPs, inspect truncation previews and copy ready-to-paste HTML & JSON-LD.',
  mode:'SERP + fixes',
  exampleBtn:'Load example',
  urlLabel:'Page URL',
  titleLabel:'Meta title',
  descLabel:'Meta description',
  h1Label:'H1 (optional)',
  queryLabel:'Primary search query (optional)',
  authorLabel:'Author (optional, for Article JSON-LD)',
  schemaLabel:'Schema.org type',
  runBtn:'Check snippet & build tags',
  copyBtn:'Copy <head> + JSON-LD',
  copiedBtn:'Copied',
  downloadBtn:'Download JSON',
  doneOk:'Snippet fits target pixel budgets. Ready-to-paste tags generated.',
  doneWarn:'Snippet length or query coverage warnings detected.',
  missing:'Provide a title or description.',
  mTitlePx:'Title width (px)',
  mTitleChars:'Title chars',
  mDescPx:'Description width (px)',
  mDescChars:'Description chars',
  desktopHeading:'Desktop SERP preview (580 / 920 px)',
  mobileHeading:'Mobile SERP preview (520 / 680 px)',
  snippetHeading:'Ready-to-paste <head> + JSON-LD',
  noFixUrl:'Provide a valid http/https URL to generate canonical and JSON-LD snippets.'
 }
};

function pixelMeterBar(label,px,limitPx){
 const pct=Math.min(100,Math.round((px/limitPx)*100));
 const color=px>limitPx?'#a63732':px>limitPx*0.92?'#885b16':'#27664a';
 return el('div',{className:'reproleaf-audit-bar'},
  el('div',{className:'reproleaf-audit-head'},
   el('strong',{},label),
   el('span',{className:'reproleaf-audit-sub'},`${px} / ${limitPx} px (${pct}%)`)
  ),
  el('div',{className:'reproleaf-distribution-track'},
   el('span',{className:'reproleaf-dist-seg',style:`width:${pct}%;--status-color:${color}`})
  )
 );
}

function previewCard(heading,url,titleText,descText){
 return el('div',{className:'reproleaf-ai-card'},
  el('div',{className:'reproleaf-ai-card-head'},
   el('span',{className:'reproleaf-ai-rank'},heading),
   url?el('span',{className:'reproleaf-audit-sub'},url):null
  ),
  el('strong',{className:'reproleaf-finding-title'},titleText||'—'),
  el('p',{},descText||'—')
 );
}

export function mount(root){
 const language=root.dataset.language==='en'?'en':'ru';
 const t=copy[language];
 const frame=createToolFrame({root,title:t.title,subtitle:t.subtitle,modeLabel:t.mode,language});

 const urlInput=el('input',{type:'url',className:'ym-disable-keys',placeholder:'https://evolkov.tech/tools/reproleaf',maxLength:2048});
 const titleInput=el('input',{type:'text',className:'ym-disable-keys',maxLength:500});
 const descInput=el('textarea',{className:'ym-disable-keys reproleaf-short',rows:3,maxLength:1000});
 const h1Input=el('input',{type:'text',className:'ym-disable-keys',maxLength:500});
 const queryInput=el('input',{type:'text',className:'ym-disable-keys',maxLength:200});
 const authorInput=el('input',{type:'text',className:'ym-disable-keys',maxLength:160});
 const typeSelect=el('select',{className:'ym-disable-keys'},
  el('option',{value:'Article'},'Article'),
  el('option',{value:'SoftwareApplication'},'SoftwareApplication')
 );
 const exampleBtn=el('button',{type:'button',className:'reproleaf-text-button'},t.exampleBtn);
 const runBtn=el('button',{type:'submit',className:'agent-kit-download'},t.runBtn);
 const copyBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.copyBtn);
 const downloadBtn=el('button',{type:'button',className:'reproleaf-text-button',disabled:true},t.downloadBtn);

 frame.form.append(
  exampleBtn,
  el('label',{},t.urlLabel,urlInput),
  el('label',{},t.titleLabel,titleInput),
  el('label',{},t.descLabel,descInput),
  el('div',{className:'reproleaf-fields'},
   el('label',{},t.h1Label,h1Input),
   el('label',{},t.queryLabel,queryInput)
  ),
  el('div',{className:'reproleaf-fields'},
   el('label',{},t.authorLabel,authorInput),
   el('label',{},t.schemaLabel,typeSelect)
  ),
  el('div',{className:'agent-kit-actions'},runBtn,copyBtn,downloadBtn)
 );

 let lastPayload=null;
 let lastSnippet='';

 exampleBtn.onclick=()=>{
  urlInput.value='https://evolkov.tech/tools/reproleaf';
  titleInput.value=language==='ru'
   ?'Проверка SEO текста, JSON-LD и llms.txt онлайн — Reproleaf'
   :'Deterministic SEO, JSON-LD and llms.txt Audit — Reproleaf';
  descInput.value=language==='ru'
   ?'Проверьте ширину title и description в пикселях, структуру H1-H6, JSON-LD разметку и готовность страницы к AI-поиску.'
   :'Check title and description pixel width, heading hierarchy, JSON-LD structured data and AI search readiness without server upload.';
  h1Input.value=language==='ru'?'Бесплатная проверка SEO и AI-готовности':'Free SEO & AI Search Readiness Audit';
  queryInput.value=language==='ru'?'проверка seo':'seo audit';
  authorInput.value='Evgenii Volkov';
  typeSelect.value='SoftwareApplication';
 };

 copyBtn.onclick=()=>{
  if(!lastSnippet)return;
  void copyText(lastSnippet,copyBtn,t.copiedBtn,t.copyBtn);
  emitToolEvent(root,{tool:'serp-preview',ok:true,action:'copy_fix'});
 };

 downloadBtn.onclick=()=>{
  if(!lastPayload)return;
  downloadText('reproleaf-serp-preview.json',JSON.stringify(lastPayload,null,2)+'\n');
  emitToolEvent(root,{tool:'serp-preview',ok:Boolean(lastPayload.serp?.ok),action:'download_json'});
 };

 frame.form.addEventListener('submit',event=>{
  event.preventDefault();
  const title=titleInput.value.trim();
  const description=descInput.value.trim();
  if(!title&&!description){
   frame.status.textContent=t.missing;
   return;
  }
  const urlVal=urlInput.value.trim();
  const serpInput={
   ...(title?{title}:{}),
   ...(description?{description}:{}),
   ...(h1Input.value.trim()?{h1:h1Input.value.trim()}:{}),
   ...(queryInput.value.trim()?{primaryQuery:queryInput.value.trim()}:{})
  };
  if(urlVal){
   try{
    const parsedUrl=new URL(urlVal);
    if(parsedUrl.protocol==='http:'||parsedUrl.protocol==='https:')serpInput.url=parsedUrl.href;
   }catch{}
  }

  try{
   const serpReport=auditSerpSnippet(serpInput);
   let fixesReport=null;
   if(serpInput.url&&title){
    fixesReport=suggestSeoFixes({
     url:serpInput.url,
     title,
     ...(description?{description}:{}),
     ...(h1Input.value.trim()?{h1:h1Input.value.trim()}:{}),
     ...(authorInput.value.trim()?{author:authorInput.value.trim()}:{}),
     locale:language,
     type:typeSelect.value
    });
   }

   lastPayload={serp:serpReport,fixes:fixesReport};
   lastSnippet=fixesReport?fixesReport.snippets.fullHeadSnippet:'';
   copyBtn.disabled=!lastSnippet;
   downloadBtn.disabled=false;

   frame.status.textContent=serpReport.findings.length===0?t.doneOk:t.doneWarn;
   renderMetrics(frame.metrics,[
    {value:serpReport.metrics.titlePixels,label:t.mTitlePx},
    {value:serpReport.metrics.titleChars,label:t.mTitleChars},
    {value:serpReport.metrics.descriptionPixels,label:t.mDescPx},
    {value:serpReport.metrics.descriptionChars,label:t.mDescChars}
   ]);

   frame.extra.replaceChildren(
    pixelMeterBar('Title',serpReport.metrics.titlePixels,580),
    pixelMeterBar('Description',serpReport.metrics.descriptionPixels,920),
    previewCard(t.desktopHeading,serpReport.preview.url,serpReport.preview.desktopTitle,serpReport.preview.desktopDescription),
    previewCard(t.mobileHeading,serpReport.preview.url,serpReport.preview.mobileTitle,serpReport.preview.mobileDescription)
   );

   if(lastSnippet){
    frame.extra.append(el('div',{className:'reproleaf-ai-rewrite'},
     el('p',{className:'reproleaf-report-label'},t.snippetHeading),
     el('pre',{},lastSnippet)
    ));
   }else{
    frame.extra.append(el('p',{className:'reproleaf-help'},t.noFixUrl));
   }

   renderFindings(frame.findings,frame.findingsTitle,serpReport.findings,language);
   emitToolEvent(root,{
    tool:'serp-preview',
    ok:serpReport.ok,
    errorCount:serpReport.findings.filter(f=>f.severity==='error').length,
    warningCount:serpReport.findings.filter(f=>f.severity==='warning'||f.severity==='warn').length,
    codes:serpReport.findings.map(f=>f.code),
    action:'run'
   });
  }catch(error){
   frame.status.textContent=error.message||'Invalid input';
  }
 });
}
