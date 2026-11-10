import './selects.js';
for(const root of document.querySelectorAll('[data-reproleaf-install]')){
 const tabs=[...root.querySelectorAll('[role=tab]')],panels=[...root.querySelectorAll('[role=tabpanel]')];
 function choose(tab){for(const button of tabs){const active=button===tab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}for(const panel of panels)panel.hidden=panel.dataset.installPanel!==tab.dataset.installClient;root.querySelector('[data-install-status]').textContent='';}
 for(const[at,tab]of tabs.entries()){tab.onclick=()=>choose(tab);tab.onkeydown=event=>{const next=event.key==='ArrowRight'?(at+1)%tabs.length:event.key==='ArrowLeft'?(at+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next===null)return;event.preventDefault();choose(tabs[next]);tabs[next].focus();};}
 root.querySelector('[data-install-os]').onchange=event=>{for(const code of root.querySelectorAll('[data-install-code]'))code.textContent=code.dataset[event.target.value];};
 async function copy(code,remote=false){
  const status=root.querySelector('[data-install-status]'),ru=document.documentElement.lang.startsWith('ru');if(!code||!status)return;
  try{await navigator.clipboard.writeText(code.textContent);status.textContent=remote?(ru?'MCP URL скопирован. Добавьте его в настройки клиента с поддержкой Streamable HTTP.':'MCP URL copied. Add it to a client that supports Streamable HTTP.'):(ru?'Команды скопированы. Проверьте путь к папке перед запуском.':'Commands copied. Check the directory path before running.');}
  catch{const range=document.createRange();range.selectNodeContents(code);getSelection().removeAllRanges();getSelection().addRange(range);status.textContent=remote?(ru?'Скопируйте выделенный MCP URL вручную.':'Copy the selected MCP URL manually.'):(ru?'Скопируйте выделенные команды вручную.':'Copy the selected commands manually.');}
 }
 for(const button of root.querySelectorAll('[data-install-copy]'))button.onclick=()=>copy(button.closest('[role=tabpanel]')?.querySelector('[data-install-code]'));
 for(const button of root.querySelectorAll('[data-install-remote-copy]'))button.onclick=()=>copy(root.querySelector('[data-install-remote-url]'),true);
}
for(const root of document.querySelectorAll('[data-reproleaf-catalog]')){
 const rows=[...root.querySelectorAll('[data-case-row]')],query=root.querySelector('[data-case-query]'),stack=root.querySelector('select[data-case-stack]'),previous=root.querySelector('[data-case-prev]'),next=root.querySelector('[data-case-next]'),label=root.querySelector('[data-case-page]'),count=root.querySelector('[data-case-count]'),ru=root.dataset.language==='ru';let page=0;
 function render(){const text=query.value.trim().toLocaleLowerCase(),matches=rows.filter(row=>(stack.value==='all'||row.dataset.caseStack===stack.value)&&row.textContent.toLocaleLowerCase().includes(text)),pages=Math.max(1,Math.ceil(matches.length/4));page=Math.min(page,pages-1);for(const row of rows)row.hidden=true;for(const row of matches.slice(page*4,page*4+4))row.hidden=false;previous.disabled=page===0;next.disabled=page===pages-1;label.textContent=(page+1)+' / '+pages;count.textContent=ru?'Найдено: '+matches.length+'. Показано до 4 записей.':'Found: '+matches.length+'. Showing up to 4 entries.';}
 query.oninput=()=>{page=0;render();};stack.onchange=()=>{page=0;render();};previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};render();
}
