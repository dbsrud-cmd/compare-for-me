import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url), output=new URL('deploy/public/',root);
await mkdir(output,{recursive:true});
for(const name of ['index.html','app.js','render.js','style.css','contract.mjs']) await copyFile(new URL(name,root),new URL(name,output));
console.log(`Public assets prepared: ${fileURLToPath(output)} (5 files, no server secrets)`);
