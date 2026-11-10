export const fixed=new URLSearchParams(location.search).get('variant')==='fixed';
export const root=document.querySelector('#fixture');
export function ready(){document.documentElement.dataset.fixtureReady='true';}
