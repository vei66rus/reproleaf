import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {root} from '../src/catalog.mjs';

test('server.json, glama.json, smithery.yaml and package.json stay aligned for MCP directories',async()=>{
 const [pkg,server,glama,smithery]=await Promise.all([
  readFile(path.join(root,'package.json'),'utf8').then(JSON.parse),
  readFile(path.join(root,'server.json'),'utf8').then(JSON.parse),
  readFile(path.join(root,'glama.json'),'utf8').then(JSON.parse),
  readFile(path.join(root,'smithery.yaml'),'utf8')
 ]);

 assert.equal(pkg.mcpName,server.name);
 assert.equal(pkg.version,server.version);
 assert.equal(server.packages?.[0]?.registryType,'npm');
 assert.equal(server.packages?.[0]?.identifier,pkg.name);
 assert.equal(server.packages?.[0]?.version,pkg.version);
 assert.equal(server.remotes?.[0]?.type,'streamable-http');
 assert.ok(server.remotes?.[0]?.url?.startsWith('https://'));

 assert.ok(Array.isArray(glama.maintainers)&&glama.maintainers.includes('vei66rus'));
 assert.match(smithery,/type: stdio/);
 assert.match(smithery,/required: \[serverPath\]/);
 assert.match(smithery,/command: 'node'/);
 assert.match(smithery,/args: \[config\.serverPath\]/);
 assert.match(smithery,/serverPath: \/absolute\/path\/to\/reproleaf\/src\/mcp\.mjs/);
 assert.doesNotMatch(smithery,/npx|reproleaf-mcp/);
});
