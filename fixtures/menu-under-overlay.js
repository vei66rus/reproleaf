import {fixed,root,ready} from './shared.js';
root.innerHTML=`<main><h1>Contact and navigation layers</h1><button data-open>Open menu</button><section class="contact-layer"><label>Your synthetic contact<input value="sample@example.invalid" readonly></label><button type="button">Contact control</button></section><nav class="overlay-menu" hidden aria-label="Sample navigation"><h2>Menu</h2><a href="#result" data-menu-link>Read the case</a></nav><p id="result" role="status"></p></main>`;
const menu=root.querySelector('nav');menu.style.zIndex=fixed?'100':'20';
root.querySelector('[data-open]').onclick=()=>{menu.hidden=false;};
root.querySelector('[data-menu-link]').onclick=e=>{e.preventDefault();root.querySelector('#result').textContent='Navigation activated';};
ready();
