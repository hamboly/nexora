// Local source checkpoints. Never copy credentials, deployment metadata or browser data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const archive = path.join(root, '.versions');
const localUrl = 'http://127.0.0.1:8471/';
const productionUrl = 'https://nexora-ham.vercel.app/';
const roots = ['app.js','alarm-clock.js','index.html','styles.css','widget-layout.js','widget-canvas.js','favicon.svg','README.md','AGENTS.md','.gitignore','.vercelignore','VERSION','VERSIONS.md'];
const folders = ['scripts','tests','docs','supabase'];
const extensions = new Set(['.js','.cjs','.css','.html','.svg','.md','.sql']);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const versionPattern = /^v\d{3,}$/;
function versions() {
  if (!fs.existsSync(archive)) return [];
  return fs.readdirSync(archive).filter(name => versionPattern.test(name)).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));
}
function sourceFiles() {
  const files = roots.filter(name=>fs.existsSync(path.join(root,name)));
  function walk(relative) {
    for(const item of fs.readdirSync(path.join(root,relative),{withFileTypes:true})) {
      if(item.name.startsWith('.') || item.isSymbolicLink()) continue;
      const name=relative+'/'+item.name;
      if(item.isDirectory()) walk(name);
      else if(item.isFile() && extensions.has(path.extname(name))) files.push(name);
    }
  }
  folders.filter(name=>fs.existsSync(path.join(root,name))).forEach(walk);
  return files.sort();
}
function verify(version) {
  if(!versionPattern.test(version||'')) throw Error('Use an existing vNNN version.');
  const directory=path.join(archive,version);
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==version) throw Error('Version mismatch.');
  for(const file of manifest.files) {
    const target=path.resolve(directory,'source',file.path);
    if(!target.startsWith(path.join(directory,'source')+path.sep)) throw Error('Unsafe snapshot path.');
    if(hash(fs.readFileSync(target))!==file.sha256) throw Error('Snapshot changed: '+file.path);
  }
  console.log(`${version}: verified ${manifest.files.length} source files`);
  return manifest;
}
function create(description) {
  if(!description?.trim()) throw Error('Provide a short change description.');
  fs.mkdirSync(archive,{recursive:true});
  const previous=versions();
  const version='v'+String(Number(previous.at(-1)?.slice(1)||0)+1).padStart(3,'0');
  const directory=path.join(archive,version);
  fs.mkdirSync(directory); // Exclusive: never overwrite a checkpoint.
  const createdAt=new Date().toISOString();
  fs.writeFileSync(path.join(root,'VERSION'),version+'\n');
  const registry=path.join(root,'VERSIONS.md');
  const heading='# Nexora versions\n\nLocal source checkpoints; credentials and browser data are excluded.\n\n';
  const entry=`## ${version} — ${description.replace(/[\r\n]+/g,' ')}\n\n- Created: ${createdAt}\n- Snapshot: .versions/${version}/source/\n- Local: ${localUrl}\n- Production: ${productionUrl}\n- Publication status at checkpoint: not published\n\n`;
  fs.writeFileSync(registry,(fs.existsSync(registry)?fs.readFileSync(registry,'utf8'):heading)+entry);
  const files=[];
  for(const name of sourceFiles()) {
    const source=path.join(root,name);
    if(fs.lstatSync(source).isSymbolicLink()) throw Error('Refusing linked source: '+name);
    const content=fs.readFileSync(source),target=path.join(directory,'source',name);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,{flag:'wx'});
    files.push({path:name,sha256:hash(content)});
  }
  const manifest={version,description,createdAt,localUrl,productionUrl,publicationStatus:'not-published',files};
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  verify(version);
  console.log(`Local: ${localUrl}\nProduction: ${productionUrl} (this checkpoint is not published)`);
}
try {
  const [action,value,...rest]=process.argv.slice(2);
  if(action==='create') create([value,...rest].filter(Boolean).join(' '));
  else if(action==='verify') verify(value);
  else if(action==='list') console.log(versions().join('\n')||'No checkpoints yet.');
  else throw Error('Usage: node scripts/versions.cjs create "Description" | verify vNNN | list');
} catch(error) { console.error(error.message);process.exitCode=1; }
