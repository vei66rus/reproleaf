import {createApp,h,ref} from 'vue';
import {fixed,root,ready} from './shared.js';
createApp({setup(){
 const open=ref(false);
 const heading=()=>h('header',{class:'detail-heading'},[h('h2','Sample project details'),h('button',{'data-close':'',onClick:()=>open.value=false,'aria-label':'Close details'},'Close')]);
 const paragraphs=()=>Array.from({length:18},(_,i)=>h('p',`Section ${i+1}. This synthetic project contains no customer data. Read the details and return using the close control.`));
 return ()=>h('main',[h('h1','A long project detail panel'),h('button',{'data-open':'',onClick:()=>open.value=true},'Open details'),open.value?h('section',{role:'dialog','aria-modal':'true','aria-label':'Sample project details',class:'detail '+(fixed?'detail-fixed':'detail-broken')},fixed?[heading(),h('div',{class:'detail-body','data-scroll':''},paragraphs())]:[h('div',{class:'detail-body','data-scroll':''},[heading(),...paragraphs()])]):null]);
}}).mount(root);
ready();
