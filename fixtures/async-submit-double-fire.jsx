import React,{useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {fixed,root,ready} from './shared.js';
function OrderForm(){
 const [submissions,setSubmissions]=useState(0);
 const [pending,setPending]=useState(false);
 const inFlight=useRef(false);
 function handleSubmit(event){
  event.preventDefault();
  if(fixed&&inFlight.current)return;
  inFlight.current=true;
  setPending(true);
  setSubmissions(count=>count+1);
  setTimeout(()=>{inFlight.current=false;setPending(false);},220);
 }
 return <main><h1>Async request submission</h1><form onSubmit={handleSubmit} aria-busy={fixed&&pending?'true':'false'}><label>Project reference<input defaultValue="SYNTH-01" readOnly/></label><button type="submit" data-submit="" disabled={fixed&&pending}>Send request</button></form><p data-submissions="">{submissions}</p></main>;
}
flushSync(()=>createRoot(root).render(<OrderForm/>));
ready();
