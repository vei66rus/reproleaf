import {startApi} from '../../src/api.mjs';
import {normalizePeer} from '../../src/public-gateway-policy.mjs';
import {version} from '../../src/version.mjs';

const origin=process.env.REPROLEAF_GATEWAY_ORIGIN;
const proxy=process.env.REPROLEAF_GATEWAY_TRUSTED_PROXY;
let parsed;
try{parsed=new URL(origin);}catch{throw Error('Set REPROLEAF_GATEWAY_ORIGIN to the exact public HTTPS origin.');}
if(parsed.protocol!=='https:'||origin!==parsed.origin)throw Error('The public origin must be an exact HTTPS origin.');
if(!normalizePeer(proxy))throw Error('Set REPROLEAF_GATEWAY_TRUSTED_PROXY to the exact proxy peer IP.');
const api=await startApi({
 port:4180,listenHost:'0.0.0.0',publicGatewayOnly:true,
 maxBytes:1048576,maxConcurrent:2,rateLimitPerMinute:30,maxRateBuckets:1000,
 requestTimeoutMs:5000,allowedOrigins:[origin],trustedProxyPeers:[proxy]
});
api.server.maxConnections=64;
api.server.maxRequestsPerSocket=100;
console.log(JSON.stringify({event:'public-gateway-ready',version,publicOnly:true,port:4180}));
let closing=false;
function close(){if(closing)return;closing=true;const limit=setTimeout(()=>process.exit(1),10000);limit.unref();api.close().then(()=>process.exit(0),()=>process.exit(1));}
process.on('SIGTERM',close);
process.on('SIGINT',close);
