/** Bounded, passive file-signature and header inspection for pasted hex.
 * No execution and no inference of runtime behavior from arbitrary raw bytes.
 * Offsets describe the decoded byte stream; sourceOffset links to document text. */
const MAX_BYTES = 131072;
const ascii = (bytes, start, length) => Array.from(bytes.slice(start, start + length)).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '').join('');
const cstring = (b, start, max = 120) => {
  if (!Number.isSafeInteger(start) || start < 0 || start >= b.length) return '';
  let end = start;
  while (end < b.length && end < start + max && b[end] >= 32 && b[end] <= 126) end++;
  return ascii(b, start, end-start);
};
const uint = (b, i, size, little = true) => {
  if (i < 0 || i + size > b.length || size > 6) return null;
  let result = 0;
  if (little) for (let k = size - 1; k >= 0; k--) result = result * 256 + b[i + k];
  else for (let k = 0; k < size; k++) result = result * 256 + b[i + k];
  return Number.isSafeInteger(result) ? result : null;
};
const displayHex = value => value === null ? '?' : '0x' + value.toString(16).toUpperCase();
const section = (name, start, size, kind, detail = '') => ({ name, start, size, kind, detail });
function signature(b) {
  if (b[0] === 0x4d && b[1] === 0x5a) return 'PE / DOS executable';
  if (b[0] === 0x7f && ascii(b,1,3) === 'ELF') return 'ELF executable / shared object';
  if (b[0]===0 && ascii(b,1,3)==='asm') return 'WebAssembly module';
  if ([0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe].some(v => uint(b,0,4,false)===v)) return 'Mach-O binary';
  if (b[0]===0x89 && ascii(b,1,3)==='PNG') return 'PNG image';
  if (b[0]===0x50 && b[1]===0x4b && b[2]===3 && b[3]===4) return 'ZIP archive / ZIP-based container';
  if (ascii(b,0,4)==='RIFF') return 'RIFF container';
  if (ascii(b,0,4)==='%PDF') return 'PDF document';
  return null;
}
function readVar(b, position) {
  let value=0, shift=0, i=position;
  for(;i<b.length&&i<position+5;i++) { const v=b[i]; value+=(v&127)*2**shift; if (!(v&128)) return { value, next:i+1 }; shift+=7; }
  return null;
}
const apiClues = [
  ['CreateProcess', 'Process creation API name appears in file bytes; this does not prove a process is launched.'],
  ['VirtualAlloc', 'Memory allocation API name appears; actual calls are not established.'],
  ['LoadLibrary', 'Dynamic library loading API name appears.'],
  ['GetProcAddress', 'Runtime symbol lookup API name appears.'],
  ['socket', 'Networking-related symbol appears; no network activity has been observed.'],
  ['connect', 'Connection-related symbol appears; no connection has been observed.'],
  ['WriteFile', 'File-output API name appears.'],
  ['ReadFile', 'File-input API name appears.'],
];
/** Accepts bytes from the beginning of a file. Partial headers remain partial. */
export function inspectBinaryStructure(input, sourcePositions = []) {
  const b = input instanceof Uint8Array ? input.subarray(0, MAX_BYTES) : Uint8Array.from(input || []).subarray(0, MAX_BYTES);
  const format = signature(b);
  if (!format) return { format:null, architecture:null, sections:[], imports:[], clues:[], warnings:[], inspectedBytes:b.length, partial:false };
  const sections = [], clues = [], warnings = [], imports = [];
  let architecture = null, imageBase = null;
  const push = (name,start,size,kind,detail) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start<0 || size<0) return;
    sections.push({ ...section(name,start,size,kind,detail), sourceOffset:sourcePositions[start] ?? null,
      available: start + size <= b.length });
  };
  if (format.startsWith('PE')) {
    push('DOS header',0,64,'header','DOS MZ header');
    architecture = { family:'x86', mode:16, label:'16-bit DOS MZ (provisional)', verified:false };
    if (b.length < 0x40) warnings.push('Not enough bytes to read the PE header pointer.');
    else {
      const pe = uint(b,0x3c,4);
      if (pe === null || pe+24>b.length || ascii(b,pe,4)!=='PE') warnings.push('PE signature not available or invalid; only the MZ header is confirmed.');
      else {
        push('PE signature + COFF header',pe,24,'header');
        const count = Math.min(uint(b,pe+6,2)||0,96), optional = uint(b,pe+20,2)||0;
        const magic = uint(b,pe+24,2);
        const machine = uint(b,pe+4,2);
        const mode = machine === 0x8664 && magic === 0x20b ? 64
          : machine === 0x14c && magic === 0x10b ? 32 : null;
        architecture = {family:mode?'x86':'unsupported',mode,
          label:mode?`x86-${mode} PE executable`:`Unsupported PE machine ${displayHex(machine)}`,
          machine,verified:Boolean(mode)};
        const basePosition = pe + 24 + (magic === 0x20b ? 24 : 28);
        const baseSize = magic === 0x20b ? 8 : magic === 0x10b ? 4 : 0;
        if (baseSize && basePosition + baseSize <= pe + 24 + optional && basePosition + baseSize <= b.length) {
          imageBase = uint(b,basePosition,baseSize===8?6:4);
          if (baseSize === 8) { // Preserve only image bases representable without JS precision loss.
            const high = uint(b,basePosition+4,4);
            const low = uint(b,basePosition,4);
            imageBase = high * 2**32 + low;
            if (!Number.isSafeInteger(imageBase)) imageBase = null;
          }
        }
        clues.push(`COFF machine: ${displayHex(machine)} · ${count} declared section(s) · ${magic === 0x20b?'PE32+ 64-bit':magic === 0x10b?'PE32 32-bit':'unknown optional header'}.`);
        push('Optional header',pe+24,optional,'header');
        const base=pe+24+optional;
        const sectionRows=[];
        if (base+count*40>b.length) warnings.push('Some section-table entries are not present in the pasted bytes.');
        for(let i=0;i<count;i++) {
          const p=base+i*40; if (p+40>b.length) break;
          const name=ascii(b,p,8).replace(/\0.*$/,'') || `section ${i+1}`;
          const size=uint(b,p+16,4), offset=uint(b,p+20,4), flags=uint(b,p+36,4);
          const va=uint(b,p+12,4), virtualSize=uint(b,p+8,4);
          sectionRows.push({va,virtualSize,offset,size});
          push(name,offset,size,(flags&0x20000000)?'code':(flags&0x80000000)?'data':'section',`RVA ${displayHex(va)} · section flags ${displayHex(flags)}`);
          sections[sections.length - 1].rva = va;
          sections[sections.length - 1].virtualSize = virtualSize;
        }
        const entry = uint(b,pe+40,4);
        if (entry !== null) clues.push(`Address of entry point (RVA): ${displayHex(entry)}. This is metadata, not evidence of execution.`);
        // Resolve the PE import directory through the section table. This
        // reveals declared library dependencies, not APIs actually executed.
        const rvaToOffset = rva => {
          if (rva === null || rva < 0) return null;
          const row=sectionRows.find(c => c.va!==null && rva>=c.va && rva<c.va+Math.max(c.virtualSize||0,c.size));
          return row ? row.offset+(rva-row.va) : rva < base ? rva : null;
        };
        const directoryStart=pe+24+(magic===0x20b?112:magic===0x10b?96:Infinity);
        if(Number.isFinite(directoryStart) && directoryStart+16<=pe+24+optional && directoryStart+16<=b.length) {
          const importRva=uint(b,directoryStart+8,4);
          const importSize=uint(b,directoryStart+12,4);
          let desc=rvaToOffset(importRva);
          if(importRva && desc!==null && desc+20<=b.length) {
            push('Import directory',desc,importSize||20,'header','Declared DLL dependencies');
            for(let i=0;i<128 && desc+20<=b.length;i++,desc+=20) {
              const thunkRva=uint(b,desc,4),nameRva=uint(b,desc+12,4),iatRva=uint(b,desc+16,4);
              if(!thunkRva&&!nameRva&&!iatRva)break;
              const nameAt=rvaToOffset(nameRva);
              if(nameAt===null || nameAt>=b.length)break;
              const lib=cstring(b,nameAt,100).match(/^[a-zA-Z0-9_.-]{1,100}/)?.[0] || `DLL ${i+1}`;
              const symbols=[];
              const thunkAt=rvaToOffset(thunkRva||iatRva), step=magic===0x20b?8:4;
              if(thunkAt!==null) for(let j=0;j<64 && thunkAt+j*step+step<=b.length;j++) {
                const p=thunkAt+j*step;
                const low=uint(b,p,4), high=step===8?uint(b,p+4,4):0;
                if(!low&&!high)break;
                if ((step === 8 && high >= 0x80000000) || (step === 4 && low >= 0x80000000)) continue;
                const importAt=rvaToOffset(low);
                if(importAt!==null && importAt+3<b.length) {
                  const name=cstring(b,importAt+2,100).match(/^[a-zA-Z_?@][a-zA-Z0-9_?@$]{0,98}/)?.[0];
                  if(name)symbols.push(name);
                }
              }
              imports.push({library:lib, symbols});
            }
            if(imports.length)clues.push(`${imports.length} imported library descriptor(s) recovered; this does not prove any API is called at runtime.`);
          }
        }
      }
    }
  } else if (format.startsWith('ELF')) {
    const is64=b[4]===2, le=b[5]===1, validEndian=le||b[5]===2;
    const elfMachine = b.length >= 20 ? uint(b,18,2,le) : null;
    const mode = validEndian && le && elfMachine===62 && is64 ? 64
      : validEndian && le && elfMachine===3 && !is64 ? 32 : null;
    architecture = {family:mode?'x86':'unsupported',mode,
      label:mode?`x86-${mode} ELF executable`:`Unsupported ELF machine ${displayHex(elfMachine)}`,
      machine:elfMachine,verified:Boolean(mode)};
    const rd=(i,n)=>validEndian?uint(b,i,n,le):null;
    const headerSize = is64?64:52;
    push('ELF header',0,headerSize,'header',`${is64?'64':'32'}-bit, ${le?'little':'big'}-endian`);
    if (b.length < headerSize || !validEndian) warnings.push('Incomplete or unsupported ELF header.');
    else {
      const entry=rd(24,is64?6:4), phoff=rd(is64?32:28,is64?6:4), shoff=rd(is64?40:32,is64?6:4);
      const phent=rd(is64?54:42,2)||0, phnum=Math.min(rd(is64?56:44,2)||0,256);
      const shent=rd(is64?58:46,2)||0, shnum=Math.min(rd(is64?60:48,2)||0,512);
      const shstridx=rd(is64?62:50,2);
      clues.push(`ELF entry address: ${displayHex(entry)}; ${phnum} program headers, ${shnum} section headers declared.`);
      const progNames={0:'NULL',1:'LOAD',2:'DYNAMIC',3:'INTERP',4:'NOTE',6:'PHDR',7:'TLS',0x6474e551:'GNU_STACK',0x6474e552:'GNU_RELRO'};
      if (phoff!==null && phent>0) {
        for(let i=0;i<phnum;i++) {
          const p=phoff+i*phent;if (p+(is64?56:32)>b.length) {if(i===0) warnings.push('ELF program headers are outside the inspected prefix.'); break;}
          const type=rd(p,4), flags=rd(p+(is64?4:24),4);
          const off=rd(p+(is64?8:4),is64?6:4), size=rd(p+(is64?32:16),is64?6:4);
          const virtualAddress = rd(p+(is64?16:8),is64?6:4);
          push(`Segment ${i+1}: ${progNames[type]||displayHex(type)}`,off,size,(flags&1)?'code':'segment',`Flags ${displayHex(flags)} · file extent`);
          sections[sections.length - 1].virtualAddress = virtualAddress;
        }
      }
      if (shoff!==null && shent>0 && shstridx!==null && shstridx<shnum && shoff+(shstridx+1)*shent<=b.length) {
        const strEntry=shoff+shstridx*shent;
        const strStart=rd(strEntry+(is64?24:16),is64?6:4);
        const strLen=rd(strEntry+(is64?32:20),is64?6:4);
        const sectionName=idx => {
          if (strStart===null || strLen===null || idx>=strLen || strStart+idx>=b.length) return '';
          let end=strStart+idx; while(end<Math.min(b.length,strStart+strLen) && b[end]!==0 && end<strStart+idx+80) end++;
          return ascii(b,strStart+idx,end-(strStart+idx));
        };
        for(let i=0;i<shnum;i++) {
          const p=shoff+i*shent;if(p+(is64?64:40)>b.length) break;
          const name=sectionName(rd(p,4)||0);
          const off=rd(p+(is64?24:16),is64?6:4), len=rd(p+(is64?32:20),is64?6:4);
          const flags=rd(p+(is64?8:8),is64?6:4)||0;
          if(i) {
            push(name||`Section ${i}`,off,len,(flags&4)?'code':'section',`ELF section flags ${displayHex(flags)}`);
            sections[sections.length - 1].virtualAddress = rd(p+(is64?16:12),is64?6:4);
          }
        }
      } else if (shnum) warnings.push('ELF section names need the section table and its string table within the inspected bytes.');
    }
  } else if (format==='WebAssembly module') {
    push('WASM header',0,8,'header');
    const names={0:'Custom',1:'Type',2:'Import',3:'Function declarations',4:'Table',5:'Memory',6:'Global',7:'Export',8:'Start',9:'Element',10:'Code',11:'Data',12:'Data count'};
    let at=8, guard=0;
    while(at<b.length&&guard++<512){ const type=b[at], sz=readVar(b,at+1);if(!sz)break;
      push(names[type]||`Section ${type}`,sz.next,sz.value,type===10?'code':'section');
      if(sz.next+sz.value>b.length){warnings.push('A WASM section is incomplete in the preview.');break;}
      at=sz.next+sz.value;
    }
  } else if (format==='PNG image') {
    push('PNG signature',0,8,'header');let pos=8;
    for(let i=0;i<64 && pos+12<=b.length;i++) {
      const sz=uint(b,pos,4,false),kind=ascii(b,pos+4,4);
      if (sz===null || sz>100000000 || !/^[A-Za-z]{4}$/.test(kind))break;
      push(kind,pos,sz+12,'section',`${sz} payload bytes plus framing`); pos+=sz+12;
      if(kind==='IEND')break;
    }
  } else if (format==='RIFF container') {
    push('RIFF header',0,12,'header',`Type: ${ascii(b,8,4)}`);
    let pos=12; for(let i=0;i<100 && pos+8<=b.length;i++) {
      const size=uint(b,pos+4,4);if(size===null || size>100000000)break;
      push(ascii(b,pos,4),pos,size+8,'section');pos+=8+size+(size%2);
    }
  } else if(format==='ZIP archive / ZIP-based container') {
    let pos=0; for(let i=0;i<100&&pos+30<=b.length;i++) {
      if (uint(b,pos,4)!==0x04034b50)break;
      const compressed=uint(b,pos+18,4), nameLen=uint(b,pos+26,2), extraLen=uint(b,pos+28,2);
      const filename=ascii(b,pos+30,Math.min(nameLen||0,120));
      if ([compressed,nameLen,extraLen].some(x=>x===null))break;
      push(filename||`ZIP entry ${i+1}`,pos,30+nameLen+extraLen+compressed,'section','Local ZIP file entry (size may require data descriptor)');
      const next=pos+30+nameLen+extraLen+compressed;if(next<=pos)break;pos=next;
    }
  } else if(format==='PDF document') push('PDF signature',0,8,'header');
  else if(format==='Mach-O binary') {push('Mach-O header',0,32,'header'); warnings.push('Mach-O load-command and fat-slice decoding is not yet implemented.');}
  // String-based clues are explicitly labeled as unverified evidence, not actions.
  const readable=ascii(b,0,b.length);
  const importedNames=imports.flatMap(item=>item.symbols);
  if(importedNames.length)clues.push(`Declared API names (sample): ${importedNames.slice(0,12).join(', ')}${importedNames.length>12?'…':''}.`);
  for(const [symbol,detail] of apiClues) if(new RegExp(`\\b${symbol}\\b`,'i').test(readable)) clues.push(detail);
  if (!sections.length) warnings.push('No structural sections were decoded from the available prefix.');
  if (b.length === MAX_BYTES) warnings.push('Only the first 128 KiB of the extracted byte stream were inspected.');
  return { format, architecture, imageBase, sections, imports, clues:clues.slice(0,18), warnings, inspectedBytes:b.length, partial: b.length === MAX_BYTES };
}
/** Recognizes a hex-only file prefix (spaced or compact). No arbitrary prose scanning. */
export function extractBinaryPrefix(text, cap = MAX_BYTES) {
  const b=[], positions=[]; let pos=0; const source=String(text||'').slice(0,cap*4+512);
  // Each line is either hex tokens, optionally preceded by a hex dump offset,
  // or terminates the prefix; ASCII gutters are not interpreted as bytes.
  for(const line of source.split(/\r?\n/)) {
    const match=/^\s*(?:(?:0x)?[0-9A-Fa-f]{6,16}:?\s{2,})?((?:(?:0x)?[a-fA-F0-9]{2}(?:[ \t]+|$)){2,}|(?:0x)?[a-fA-F0-9]{8,})(?:\s{2,}.*)?$/.exec(line);
    if (!match) { if(b.length)break; pos+=line.length+1;continue; }
    const raw=match[1], base=pos+line.indexOf(raw);
    const pattern=/(?:0x)?[a-fA-F0-9]{2}/g;
    let entries=[];
    if (/^(?:0x)?[a-fA-F0-9]{8,}$/.test(raw)) {
      const prefix=/^0x/i.test(raw)?2:0;
      const body=raw.slice(prefix);if(body.length%2)break;
      entries=[...body.matchAll(/[a-fA-F0-9]{2}/g)].map(m=>({value:m[0],at:base+prefix+m.index}));
    } else entries=[...raw.matchAll(pattern)].map(m=>({value:m[0].replace(/^0x/i,''),at:base+m.index}));
    for(const entry of entries){ b.push(parseInt(entry.value,16));positions.push(entry.at);if(b.length>=cap)break; }
    pos+=line.length+1;if(b.length>=cap)break;
  }
  return { bytes:Uint8Array.from(b), sourcePositions:positions };
}
