import Phaser from 'phaser';
import {fixed,root,ready} from './shared.js';
root.innerHTML='<main class="long-page"><h1>A tap-only embedded game</h1><div class="spacer">Scroll to the game.</div><div id="game" aria-label="Synthetic tap game"></div><p role="status" data-score>Score: 0</p><div class="spacer">Continue reading below.</div></main>';
new Phaser.Game({
 type:Phaser.CANVAS,parent:'game',width:320,height:300,banner:false,
 audio:{noAudio:true},fps:{target:30},backgroundColor:'#d7e7dc',
 input:{touch:{capture:!fixed}},
 scene:{create(){
  this.add.text(22,35,'TAP THE CIRCLE',{fontFamily:'sans-serif',fontSize:'20px',color:'#18271c'});
  const circle=this.add.circle(160,165,48,0x345c43).setInteractive();
  let score=0;
  circle.on('pointerdown',()=>{circle.setFillStyle(0x649477);root.querySelector('[data-score]').textContent=`Score: ${++score}`;});
  this.game.canvas.style.touchAction=fixed?'pan-y':'none';
  ready();
 }}
});
