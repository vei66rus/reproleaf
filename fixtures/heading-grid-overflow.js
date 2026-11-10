import {fixed,root,ready} from './shared.js';
root.innerHTML=`<main><h1>A narrow editorial grid</h1><section class="heading-grid"><p>Tools</p><div><h2>WebPerformanceArchitecture</h2><p>A synthetic unbroken heading should not widen the page beyond its viewport.</p></div></section></main>`;
const heading=root.querySelector('h2');
if(fixed)heading.style.overflowWrap='anywhere';
ready();
