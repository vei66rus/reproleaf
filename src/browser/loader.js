for(const root of document.querySelectorAll('[data-reproleaf-playground]')){
 let pending;
 async function open(focus=false){
  const status=root.querySelector('[data-reproleaf-load]');status.textContent=root.dataset.language==='en'?'Opening workspace…':'Открываем рабочую панель…';
  try{pending??=import(__REPROLEAF_APP__);const module=await pending;module.mount(root);status.textContent='';root.querySelector('[data-reproleaf-panel]').hidden=false;root.querySelector('[data-reproleaf-intro]').hidden=true;if(focus)root.querySelector('[data-reproleaf-title]').focus({preventScroll:true});}
  catch{pending=null;status.textContent=root.dataset.language==='en'?'Could not load. Retry below.':'Не удалось загрузить панель. Повторите ниже.';root.querySelector('[data-reproleaf-intro]').hidden=false;}
 }
 document.addEventListener('click',event=>{const control=event.target.closest('[data-reproleaf-open]');if(!control)return;if(control.dataset.reproleafTarget&&control.dataset.reproleafTarget!==root.id)return;if(!control.dataset.reproleafTarget&&!root.contains(control))return;if(control.tagName==='BUTTON')event.preventDefault();void open(control.tagName==='BUTTON');});
 if(root.hasAttribute('data-reproleaf-auto'))void open();
}
