import { cp, lstat, readFile, readdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
async function inventory(root, relative = '') {
 const items = {};
 for (const entry of (await readdir(path.join(root, relative), { withFileTypes: true })).sort((a,b)=>a.name < b.name ? -1 : 1)) {
  const key = path.join(relative, entry.name), file = path.join(root, key);
  if (entry.isDirectory()) Object.assign(items, await inventory(root,key));
  else if (entry.isSymbolicLink()) throw Object.assign(new Error('Managed installation must contain physical files'),{code:'UNSAFE_MANAGED_LINK'});
  else items[key] = createHash('sha256').update(await readFile(file)).digest('hex');
 }
 return items;
}
async function synchronize(source, target) {
 // Caller has already backed up and verified the entire managed destination.
 const names = new Set((await readdir(source)));
 for (const entry of await readdir(target)) if (!names.has(entry)) await rm(path.join(target,entry),{recursive:true,force:true});
 await cp(source,target,{recursive:true,force:true});
}
export async function activateDirectory(stage,target,backup,{renameDirectory=rename,copyDirectory=cp}={}) {
 let moved = false;
 if (backup) {
  try { await renameDirectory(target,backup); moved = true; }
  catch (e) {
   if (!['EPERM','EACCES','EBUSY'].includes(e.code)) throw e;
   await copyDirectory(target,backup,{recursive:true,errorOnExist:true,force:false});
   if (JSON.stringify(await inventory(target)) !== JSON.stringify(await inventory(backup))) throw Object.assign(new Error('Backup verification failed'),{code:'BACKUP_VERIFY_FAILED'});
   try {
    await synchronize(stage,target);
    if (JSON.stringify(await inventory(stage)) !== JSON.stringify(await inventory(target))) throw Object.assign(new Error('Managed synchronization verification failed'),{code:'SKILL_VERIFY_FAILED'});
    return {mode:'in-place',backup};
   } catch (failure) {
    try { await synchronize(backup,target); }
    catch { throw Object.assign(new Error('Managed update requires recovery from the preserved backup'),{code:'RECOVERY_REQUIRED',details:{target,backup}}); }
    throw Object.assign(failure,{details:{...failure.details,target,backup,restored:true}});
   }
  }
 }
 try { await renameDirectory(stage,target); return {mode:'rename',backup}; }
 catch (e) { if (moved) await renameDirectory(backup,target); throw e; }
}
