import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const digest=x=>createHash('sha256').update(x).digest('hex');
export async function preserveAndWrite(file,content) {
 let previous;try{previous=await fs.readFile(file)}catch(e){if(e.code!=='ENOENT')throw e}
 const bytes=Buffer.from(content);if(previous?.equals(bytes))return false;
 if(previous){const dir=path.join(root,'.release-backups',randomUUID());await fs.mkdir(dir,{recursive:true});const copy=path.join(dir,path.basename(file));await fs.copyFile(file,copy,1);if(digest(await fs.readFile(copy))!==digest(previous))throw new Error('Release backup verification failed');}
 const temp=`${file}.release-${randomUUID()}`;await fs.writeFile(temp,bytes,{flag:'wx'});await fs.rename(temp,file);return true;
}
export async function identity() {
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));const files={};
 async function visit(relative){const actual=path.join(root,relative);const s=await fs.lstat(actual);if(s.isSymbolicLink())throw new Error('Unexpected packaged link');if(s.isDirectory()){for(const child of (await fs.readdir(actual)).sort())await visit(path.posix.join(relative,child));}else{const bytes=await fs.readFile(actual);const text=bytes.toString('utf8');if(/(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//.test(text)||/-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/.test(text))throw new Error(`Private material in ${relative}`);files[relative]=digest(bytes);}}
 for(const relative of [...new Set(['package.json',...pkg.files])].sort())if(relative!=='integrity.json')await visit(relative);
 return {schemaVersion:1,package:pkg.name,version:pkg.version,algorithm:'sha256',files};
}
