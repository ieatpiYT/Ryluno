// Read-only fallback while macOS Git is unavailable. Run git status and git diff before publishing.
import fs from 'node:fs';
const index=fs.readFileSync('.git/index');
if(index.readUInt32BE(4)!==2)throw new Error('Use git ls-files; unsupported index version');
let offset=12;const failures=[];
for(let i=0;i<index.readUInt32BE(8);i++){
 const start=offset,end=index.indexOf(0,start+62),name=index.toString('utf8',start+62,end);offset=start+Math.ceil((end-start+1)/8)*8;
 if(/(^|\/)(\.env($|\.)|\.ryluno-fo\/|.*\.pem$)/.test(name)&&name!=='.env.example')failures.push(name);
 if(!fs.existsSync(name))continue;
 const text=fs.readFileSync(name,'utf8');
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:wak_|sb_secret_)[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text))failures.push(name);
}
if(failures.length){console.error('Review potentially sensitive tracked files:',[...new Set(failures)]);process.exitCode=1;}else console.log('No sensitive paths or recognized credential formats found in indexed files. This is not a full secret audit.');
