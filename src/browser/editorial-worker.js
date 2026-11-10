import {reviewEditorial} from '../editorial-core.mjs';
import {auditBlog} from '../blog-graph.mjs';
self.onmessage=event=>{
 const phase=phase=>self.postMessage({type:'progress',phase});
 try{self.postMessage({ok:true,result:event.data.kind==='blog'?auditBlog(event.data.payload,phase):reviewEditorial(event.data.payload??event.data,phase)});}
 catch(error){self.postMessage({ok:false,issues:error.issues?.map(i=>({path:i.path.join('.'),message:i.message}))||[{path:'packet',message:error.message||'Invalid packet'}]});}
};
