import {fixed,root,ready} from './shared.js';
root.innerHTML=`<main><h1>Server-rendered FAQ disclosure</h1><button type="button" data-disclosure-trigger aria-expanded="false" aria-controls="faq-panel">Read specifications</button><section id="faq-panel" data-disclosure-panel hidden><p>Server-rendered specification details remain open when toggled before client initialization completes.</p></section></main>`;
const trigger=root.querySelector('[data-disclosure-trigger]'),panel=root.querySelector('[data-disclosure-panel]');
trigger.onclick=()=>{
 const next=trigger.getAttribute('aria-expanded')!=='true';
 trigger.setAttribute('aria-expanded',String(next));
 panel.hidden=!next;
};
window.addEventListener('reproleaf:hydrate',()=>{
 const initialOpen=fixed?trigger.getAttribute('aria-expanded')==='true':false;
 trigger.setAttribute('aria-expanded',String(initialOpen));
 panel.hidden=!initialOpen;
 document.documentElement.dataset.hydrated='true';
});
ready();
