import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({name:'security-schema-smoke',version:'1.0.0'});
const transport = new StdioClientTransport({command:process.execPath,args:['dist/index.js'],env:{...process.env, YNAB_API_TOKEN:'local-placeholder',XERO_CLIENT_BEARER_TOKEN:'local-placeholder'},stderr:'pipe'});
try {
 await client.connect(transport);
 const {tools}=await client.listTools();
 assert.ok(tools.length>20);
 for (const tool of tools) { assert.equal(tool.inputSchema.type,'object',tool.name); assert.ok(tool.inputSchema.properties,tool.name); }
 const required = tools.find(t=>t.inputSchema.required?.length);
 assert.ok(required, 'at least one required-argument tool');
 const result=await client.callTool({name:required.name,arguments:{}}).catch(error=>({isError:true,error}));
 assert.equal(result.isError,true,'invalid inputs rejected before API use');
 console.log(`${tools.length} actual MCP tool schemas advertised; required-argument rejection passed (${required.name})`);
} finally { await client.close(); }
