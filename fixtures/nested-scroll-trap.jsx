import React from 'react';
import {createRoot} from 'react-dom/client';
import {fixed,root,ready} from './shared.js';
import {flushSync} from 'react-dom';
flushSync(()=>createRoot(root).render(<main className="long-page">
 <h1>Previous page section</h1><div className="spacer">Scroll down to the contact panel.</div>
 <section data-panel="" className="nested-panel" style={{overscrollBehaviorY:fixed?'auto':'contain'}} tabIndex={0} aria-label="Synthetic contact information">
  <h2>Contact section</h2>{Array.from({length:16},(_,i)=><p key={i}>Synthetic detail {i+1}. Scroll within this section, then return to the previous page section.</p>)}
 </section><div className="spacer">End of document</div>
</main>));
ready();
