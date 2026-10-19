/** Bounded x86 decoder (16/32/64-bit modes). Never executes code.
 * Unsupported instructions return null; incomplete branch encodings are explicit.
 * File offsets are not virtual addresses: consumers must resolve mappings. */
const R64 = ['RAX','RCX','RDX','RBX','RSP','RBP','RSI','RDI','R8','R9','R10','R11','R12','R13','R14','R15'];
const R32 = ['EAX','ECX','EDX','EBX','ESP','EBP','ESI','EDI','R8D','R9D','R10D','R11D','R12D','R13D','R14D','R15D'];
const R16 = ['AX','CX','DX','BX','SP','BP','SI','DI','R8W','R9W','R10W','R11W','R12W','R13W','R14W','R15W'];
const R8 = ['AL','CL','DL','BL','SPL','BPL','SIL','DIL','R8B','R9B','R10B','R11B','R12B','R13B','R14B','R15B'];
const R8noRex = ['AL','CL','DL','BL','AH','CH','DH','BH'];
const signed = (v, bits) => bits === 8 ? (v & 128 ? v - 256 : v) : bits === 16 ? (v & 32768 ? v - 65536 : v) : v | 0;
const hx = v => `0x${v.toString(16).toUpperCase()}`;
const cond = ['O','NO','B','AE','E','NE','BE','A','S','NS','P','NP','L','GE','LE','G'];
const condHelp = [
  'overflow flag is set','overflow flag is clear','unsigned below (carry flag set)','unsigned above or equal',
  'values are equal (zero flag set)','values are different (zero flag clear)','unsigned below or equal','unsigned above',
  'sign flag is set','sign flag is clear','parity flag is set','parity flag is clear',
  'signed less than','signed greater than or equal','signed less than or equal','signed greater than',
];
export const instructionCategory = mnemonic => {
  if (/^(ADD|ADC|SUB|SBB|CMP|TEST|XOR|AND|OR|INC|DEC|NEG|NOT|SHL|SAL|SHR|SAR|ROL|ROR|IMUL|MUL|DIV|IDIV)$/.test(mnemonic)) return 'arithmetic';
  if (/^(J\w+|LOOP\w*|CALL|RET|RETF|CMOV\w+|SET\w+)$/.test(mnemonic)) return 'control';
  if (/^(PUSH|POP|PUSHFQ|POPFQ|LEAVE|ENTER)$/.test(mnemonic)) return 'stack';
  if (/^(MOV\w*|LEA|XCHG|MOVSX|MOVZX)$/.test(mnemonic)) return 'data';
  return 'system';
};
export function decodeX86At(bytes, at, options = {}) {
  if (!(bytes instanceof Uint8Array) || !Number.isInteger(at) || at < 0 || at >= bytes.length) return null;
  const mode = typeof options === 'number' ? options : (options?.mode ?? 64);
  if (![16, 32, 64].includes(mode)) return null;
  let i = at, rex = 0, operand16 = false, addressOverride = false;
  let expectedLength = null;
  const roles = [];
  const take = role => {
    if (i >= bytes.length || i - at >= 15) throw Error('truncated');
    roles.push(role); return bytes[i++];
  };
  const num = (n, role = 'immediate', signedNumber = false) => {
    let v = 0;
    for (let b = 0; b < n; b++) v += take(role) * 2 ** (b * 8);
    return signedNumber ? signed(v, n * 8) : v;
  };
  const result = (name, operands, explanation, extras = {}) => ({
    size: i - at, roles: [...roles], mnemonic: name, operands, explanation,
    category: instructionCategory(name), mode, startOffset: at, endOffset: i,
    opcodeBytes: Array.from(bytes.subarray(at, i)).filter((_, idx) => roles[idx] === 'opcode'),
    operandBytes: Array.from(bytes.subarray(at, i)).filter((_, idx) => roles[idx] === 'displacement' || roles[idx] === 'immediate'),
    prefixes: Array.from(bytes.subarray(at, i)).filter((_, idx) => roles[idx] === 'prefix'),
    ...extras,
  });
  try {
    let prefixCount = 0, repeat = '';
    while (i < bytes.length && prefixCount++ < 15) {
      const b = bytes[i];
      if (b === 0x66) { operand16 = true; take('prefix'); }
      else if (b === 0x67) { addressOverride = true; take('prefix'); }
      else if (b === 0xF3 || b === 0xF2) { repeat = b === 0xF3 ? 'REP' : 'REPNE'; take('prefix'); }
      else if (mode === 64 && b >= 0x40 && b <= 0x4F) { rex = b; take('prefix'); }
      else if ([0x26,0x2E,0x36,0x3E,0x64,0x65,0xF0].includes(b)) { take('prefix'); }
      else break;
    }
    if (i >= bytes.length) return null;
    const op = take('opcode');
    const width = mode === 64 ? ((rex & 8) ? 64 : (operand16 ? 16 : 32)) : mode === 32 ? (operand16 ? 16 : 32) : (operand16 ? 32 : 16);
    const addressWidth = mode === 64 ? (addressOverride ? 32 : 64) : mode === 32 ? (addressOverride ? 16 : 32) : (addressOverride ? 32 : 16);
    const regName = (id, w = width) => (w === 64 ? R64 : w === 32 ? R32 : w === 16 ? R16 : (rex ? R8 : R8noRex))[id];
    const byteReg = id => regName(id, 8);
    const modRM = (w = width) => {
      const b = take('modrm'), mod = b >> 6;
      const regNumber = ((b >> 3) & 7) + ((rex & 4) ? 8 : 0);
      const baseNumber = (b & 7) + ((rex & 1) ? 8 : 0);
      let rm = '', memory = mod !== 3, displacement = 0;
      if (!memory) rm = regName(baseNumber, w);
      else {
        const terms = [], rmLow = b & 7;
        let absolute = false;
        if (addressWidth === 16) {
          const names = ['BX + SI','BX + DI','BP + SI','BP + DI','SI','DI','BP','BX'];
          if (mod === 0 && rmLow === 6) { displacement = num(2, 'displacement'); absolute = true; }
          else terms.push(names[rmLow]);
          if (mod === 1) displacement = num(1, 'displacement', true);
          else if (mod === 2) displacement = num(2, 'displacement', true);
        } else {
          const addrRegs = addressWidth === 64 ? R64 : R32;
          if (rmLow === 4) {
            const sib = take('sib');
            const scale = 1 << (sib >> 6), indexField = (sib >> 3) & 7;
            const index = indexField + ((rex & 2) ? 8 : 0);
            const baseField = sib & 7, base = baseField + ((rex & 1) ? 8 : 0);
            if (!(indexField === 4 && !(rex & 2))) terms.push(addrRegs[index] + (scale === 1 ? '' : `*${scale}`));
            if (!(mod === 0 && baseField === 5)) terms.unshift(addrRegs[base]);
            else { displacement = num(4, 'displacement', true); absolute = !terms.length; }
          } else if (mod === 0 && rmLow === 5) {
            if (addressWidth === 64) terms.push('RIP');
            else absolute = true;
            displacement = num(4, 'displacement', addressWidth === 64);
          } else terms.push(addrRegs[baseNumber]);
          if (mod === 1) displacement = num(1, 'displacement', true);
          else if (mod === 2) displacement = num(4, 'displacement', true);
        }
        const offsetText = absolute ? hx(displacement) : displacement
          ? `${displacement < 0 ? ' - ' : ' + '}${hx(Math.abs(displacement))}` : '';
        rm = `[${terms.join(' + ')}${offsetText}${!terms.length && !offsetText ? '0x0' : ''}]`;
      }
      return { reg:regName(regNumber, w), rm, regNumber, digit:(b >> 3) & 7, memory };
    };
    const logicHelp = (name, dst, src) => name === 'CMP' || name === 'TEST'
      ? `${name === 'CMP' ? 'Compares' : 'Tests bits of'} ${dst} against ${src}, updating status flags without storing a result.`
      : `${name} operates on ${dst} and ${src}; the result is stored in ${dst}${name === 'MOV' ? '.' : ' and relevant status flags are updated.'}`;
    if (repeat && op === 0x90 && repeat === 'REP') return result('PAUSE', '', 'Hints to the processor that this is a spin-wait loop.');
    if (op === 0x90) return result('NOP', '', 'No operation; continues to the next instruction.');
    if (op === 0xC3) return result('RET', '', 'Returns to the saved address on the stack.', { flow: 'return' });
    if (op === 0xC2) { const size = num(2); return result('RET', hx(size), `Returns and additionally releases ${size} stack-argument bytes.`, {flow:'return'}); }
    if (op === 0xC9) return result('LEAVE', '', 'Restores the stack pointer from the frame pointer and pops the old frame pointer.');
    if (op === 0xCC) return result('INT3', '', 'Raises a debug breakpoint exception.');
    if (op === 0xF4) return result('HLT', '', 'Halts execution until a permitted external event; privileged in normal user mode.');
    if (op === 0x9C) return result(mode === 64 && width !== 16 ? 'PUSHFQ' : width === 16 ? 'PUSHF' : 'PUSHFD', '', 'Pushes the current status flags to the stack.');
    if (op === 0x9D) return result(mode === 64 && width !== 16 ? 'POPFQ' : width === 16 ? 'POPF' : 'POPFD', '', 'Restores status flags from the stack, subject to privilege restrictions.');
    if (mode !== 64 && op >= 0x40 && op <= 0x4F) {
      const name = op < 0x48 ? 'INC' : 'DEC', reg = regName(op & 7);
      return result(name, reg, `${name === 'INC' ? 'Increments' : 'Decrements'} ${reg} by one; CF is preserved.`);
    }
    const statusOpcodes = {0xF8:['CLC','Clears the carry flag.'],0xF9:['STC','Sets the carry flag.'],0xFC:['CLD','Clears the direction flag.'],0xFD:['STD','Sets the direction flag.'],0xFA:['CLI','Disables maskable interrupts if permitted.'],0xFB:['STI','Enables maskable interrupts if permitted.']};
    if (statusOpcodes[op]) return result(statusOpcodes[op][0], '', statusOpcodes[op][1]);
    if (op >= 0x50 && op <= 0x57) {const r=regName(op-0x50+((rex&1)?8:0),mode===64?(operand16?16:64):width);return result('PUSH',r,`Pushes ${r} onto the stack.`);}
    if (op >= 0x58 && op <= 0x5F) {const r=regName(op-0x58+((rex&1)?8:0),mode===64?(operand16?16:64):width);return result('POP',r,`Reads ${r} from the stack and advances the stack pointer.`);}
    if (op === 0x68 || op === 0x6A) {const n=op===0x6A?1:(width===16?2:4);const value=num(n,'immediate',true);return result('PUSH',String(value),`Pushes the sign-extended constant ${value} onto the stack.`);}
    if (op >= 0xB0 && op <= 0xB7) {const dst=byteReg(op-0xB0+((rex&1)?8:0)),v=num(1);return result('MOV',`${dst}, ${hx(v)}`,`Places immediate byte ${hx(v)} in ${dst}.`);}
    if (op >= 0xB8 && op <= 0xBF) {
      const n=width===64?8:width===16?2:4, dest=regName(op-0xB8+((rex&1)?8:0));
      const parts=[];for(let k=0;k<n;k++)parts.push(take('immediate'));
      const value='0x'+parts.reverse().map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
      return result('MOV',`${dest}, ${value}`,`Loads hexadecimal constant ${value} into ${dest}.`);
    }
    if (op === 0xE8 || op === 0xE9 || op === 0xEB || (op >= 0x70 && op <= 0x7F)) {
      const displacementWidth = (op === 0xEB || (op >= 0x70 && op <= 0x7F)) ? 8
        : mode === 64 ? 32 : (width === 16 ? 16 : 32);
      expectedLength = (i - at) + displacementWidth / 8;
      const delta = num(displacementWidth / 8, 'displacement', true);
      const name = op === 0xE8 ? 'CALL' : (op === 0xE9 || op === 0xEB) ? 'JMP' : `J${cond[op - 0x70]}`;
      const reason = name === 'CALL' ? 'Saves a return address and transfers control to a routine.'
        : name === 'JMP' ? 'Always transfers control.' : `Transfers control only when ${condHelp[op - 0x70]}.`;
      const next = at + expectedLength;
      return result(name, `${delta < 0 ? '' : '+'}${delta}`,
        `${reason} Signed ${displacementWidth}-bit little-endian displacement ${delta}; target is relative to the address immediately following the ${expectedLength}-byte instruction.`,
        { flow:name === 'CALL' ? 'call' : name === 'JMP' ? 'jump' : 'branch',
          instructionType:displacementWidth === 8?'short relative':'near relative', displacement:delta,
          displacementWidth, target:next + delta, targetOffset:next + delta, nextOffset:next,
          operandSigned:true, operandEndianness:'little' });
    }
    if (op >= 0xE0 && op <= 0xE3) {
      expectedLength = i - at + 1;
      const delta = num(1,'displacement',true);
      const counter = addressWidth === 64 ? 'JRCXZ' : addressWidth === 32 ? 'JECXZ' : 'JCXZ';
      const name = op === 0xE3 ? counter : ['LOOPNE','LOOPE','LOOP'][op-0xE0];
      return result(name,`${delta<0?'':'+'}${delta}`,
        `${name} conditionally branches using counter/flags; signed 8-bit displacement ${delta} from the next instruction.`,
        {flow:'branch',instructionType:'short relative',displacement:delta,displacementWidth:8,
         target:i+delta,targetOffset:i+delta,nextOffset:i,operandSigned:true,operandEndianness:'little'});
    }
    if (op === 0x0F) {
      const next=take('opcode');
      const specials={0x05:['SYSCALL','Requests a privileged operating-system service using the system call interface.'],0x0B:['UD2','Raises an invalid-opcode exception deliberately.'],0xA2:['CPUID','Queries processor identification and feature information.'],0x31:['RDTSC','Reads the timestamp counter into EDX:EAX.']};
      if (specials[next])return result(specials[next][0],'',specials[next][1]);
      if (next >= 0x80 && next <= 0x8F) {
        const displacementWidth = mode === 64 ? 32 : width === 16 ? 16 : 32;
        expectedLength = (i - at) + displacementWidth / 8;
        const delta = num(displacementWidth / 8, 'displacement', true), n = `J${cond[next-0x80]}`;
        const nextOffset = at + expectedLength;
        return result(n, `${delta<0?'':'+'}${delta}`,
          `Branches when ${condHelp[next-0x80]}; signed ${displacementWidth}-bit little-endian displacement ${delta} from the next instruction.`,
          {flow:'branch',instructionType:'near conditional',displacement:delta,displacementWidth,
            target:nextOffset+delta,targetOffset:nextOffset+delta,nextOffset,
            operandSigned:true,operandEndianness:'little'});
      }
      if (next === 0xAF){const m=modRM();return result('IMUL',`${m.reg}, ${m.rm}`,`Multiplies ${m.reg} by ${m.rm} (signed), placing the truncated result in ${m.reg}.`);}
      if ([0xB6,0xB7,0xBE,0xBF].includes(next)){const w=[0xB6,0xBE].includes(next)?8:16,m=modRM(w),name=next>=0xBE?'MOVSX':'MOVZX';
        const dst=regName(m.regNumber);return result(name,`${dst}, ${m.rm}`,`${name==='MOVSX'?'Sign':'Zero'}-extends ${m.rm} into ${dst}.`);}
      if (next >= 0x90 && next <= 0x9F){const m=modRM(8),name=`SET${cond[next-0x90]}`;return result(name,m.rm,`Writes 1 or 0 to ${m.rm} depending on whether ${condHelp[next-0x90]}.`);}
      if (next >= 0x40 && next <= 0x4F){const m=modRM(),name=`CMOV${cond[next-0x40]}`;return result(name,`${m.reg}, ${m.rm}`,`Copies ${m.rm} to ${m.reg} only when ${condHelp[next-0x40]}.`);}
      if (next === 0x1F){const m=modRM();return result('NOP',m.rm,'Multi-byte no-operation used for instruction alignment.');}
      if (repeat==='REP' && next===0x1E && i < bytes.length && bytes[i]===0xFA){take('opcode');return result('ENDBR64','','Valid indirect branch landing marker when CET is enabled.');}
      return null;
    }
    if (op === 0x98) return result(width===64?'CDQE':width===32?'CWDE':'CBW','','Sign-extends the accumulator into a wider accumulator register.');
    if (op === 0x99) return result(width===64?'CQO':width===32?'CDQ':'CWD','','Sign-extends the accumulator into a double-width value for signed division.');
    // Register / r/m forms and simple memory operands with SIB/displacements.
    const bin = {0x88:['MOV',8,0],0x8A:['MOV',8,1],0x89:['MOV',width,0],0x8B:['MOV',width,1],
      0x00:['ADD',8,0],0x02:['ADD',8,1],0x01:['ADD',width,0],0x03:['ADD',width,1],
      0x08:['OR',8,0],0x0A:['OR',8,1],0x09:['OR',width,0],0x0B:['OR',width,1],
      0x10:['ADC',8,0],0x12:['ADC',8,1],0x11:['ADC',width,0],0x13:['ADC',width,1],
      0x18:['SBB',8,0],0x1A:['SBB',8,1],0x19:['SBB',width,0],0x1B:['SBB',width,1],
      0x20:['AND',8,0],0x22:['AND',8,1],0x21:['AND',width,0],0x23:['AND',width,1],
      0x28:['SUB',8,0],0x2A:['SUB',8,1],0x29:['SUB',width,0],0x2B:['SUB',width,1],
      0x30:['XOR',8,0],0x32:['XOR',8,1],0x31:['XOR',width,0],0x33:['XOR',width,1],
      0x38:['CMP',8,0],0x3A:['CMP',8,1],0x39:['CMP',width,0],0x3B:['CMP',width,1],
      0x84:['TEST',8,0],0x85:['TEST',width,0],0x86:['XCHG',8,0],0x87:['XCHG',width,0]};
    if (bin[op]){const [name,w,reverse]=bin[op],m=modRM(w);const dst=reverse?m.reg:m.rm,src=reverse?m.rm:m.reg;
      return result(name,`${dst}, ${src}`,name==='XCHG'?`Swaps values in ${dst} and ${src}.`:logicHelp(name,dst,src));}
    if (op===0x8D){const m=modRM();if(!m.memory)return null;return result('LEA',`${m.reg}, ${m.rm}`,`Computes the effective address of ${m.rm} and places it in ${m.reg}, without loading memory.`);}
    if (op === 0x63 && mode === 64 && width === 64) {
      const m = modRM(32);
      const dst = R64[m.regNumber];
      return result('MOVSXD', `${dst}, ${m.rm}`, `Sign-extends the 32-bit source ${m.rm} to 64 bits and stores it in ${dst}.`);
    }
    if (op === 0xFE) {
      const m = modRM(8);
      if (m.digit !== 0 && m.digit !== 1) return null;
      const name = m.digit === 0 ? 'INC' : 'DEC';
      return result(name, m.rm, `${name} changes byte operand ${m.rm} by one without changing the carry flag.`);
    }
    if (op===0xC6||op===0xC7){const w=op===0xC6?8:width,m=modRM(w);if(m.digit!==0)return null;const n=op===0xC6?1:w===16?2:4;
      const v=num(n,'immediate',false);return result('MOV',`${m.rm}, ${hx(v)}`,`Stores immediate constant ${hx(v)} in ${m.rm}${w===64?' (sign-extended to 64 bits)':''}.`);}
    if ([0x80,0x81,0x83].includes(op)){const w=op===0x80?8:width,m=modRM(w),names=['ADD','OR','ADC','SBB','AND','SUB','XOR','CMP'];const name=names[m.digit];
      const n=op===0x80||op===0x83?1:w===16?2:4, v=num(n,'immediate',op===0x83);
      return result(name,`${m.rm}, ${v}`,logicHelp(name,m.rm,String(v)));}
    if ([0xF6,0xF7].includes(op)){const w=op===0xF6?8:width,m=modRM(w);
      if(m.digit===0){const n=w===8?1:w===16?2:4,v=num(n);return result('TEST',`${m.rm}, ${hx(v)}`,`Bitwise-tests ${m.rm} against ${hx(v)}, updating flags without storing the result.`);}
      const ops={2:'NOT',3:'NEG',4:'MUL',5:'IMUL',6:'DIV',7:'IDIV'};if(!ops[m.digit])return null;
      const name=ops[m.digit];return result(name,m.rm,`${name} acts on operand ${m.rm}; implicit accumulator registers and flags depend on the operand width.`);}
    if ([0xD1,0xD3,0xC1].includes(op)){const m=modRM(),names={0:'ROL',1:'ROR',4:'SHL',5:'SHR',7:'SAR'},name=names[m.digit];if(!name)return null;
      const amount=op===0xD1?'1':op===0xD3?'CL':String(num(1));return result(name,`${m.rm}, ${amount}`,`${name} shifts or rotates bits of ${m.rm} by ${amount}, with operation-specific flag effects.`);}
    if(op===0xFF){
      // In long mode near indirect control transfers and PUSH use 64-bit operands unless overridden for PUSH.
      const sub = (bytes[i] >> 3) & 7;
      const w = mode === 64 && (sub === 2 || sub === 4) ? 64 : mode === 64 && sub === 6 ? (operand16?16:64) : width;
      const m=modRM(w),names={0:'INC',1:'DEC',2:'CALL',4:'JMP',6:'PUSH'},name=names[m.digit];if(!name)return null;
      return result(name,m.rm,({INC:`Increments ${m.rm}.`,DEC:`Decrements ${m.rm}.`,CALL:`Calls the address in ${m.rm} and saves a return address.`,JMP:`Jumps to the address in ${m.rm}.`,PUSH:`Pushes ${m.rm} onto the stack.`})[name],{flow:({CALL:'call',JMP:'jump'})[name]});}
    if(op===0x69||op===0x6B){const m=modRM(),v=num(op===0x6B?1:width===16?2:4,'immediate',true);return result('IMUL',`${m.reg}, ${m.rm}, ${v}`,`Multiplies ${m.rm} by signed constant ${v} and stores the truncated result in ${m.reg}.`);}
    if(op===0xCD){const v=num(1);return result('INT',hx(v),`Raises software interrupt ${hx(v)}; outcome depends on operating environment.`);}
    return null;
  } catch (error) {
    if (error?.message === 'truncated' && expectedLength !== null) {
      const available = Math.max(0, Math.min(bytes.length - at, 15));
      return { incomplete:true, size:available, expectedSize:expectedLength,
        roles:[...roles], mnemonic:'Incomplete instruction', operands:'', category:'unknown', mode,
        startOffset:at, endOffset:at+available,
        explanation:`Incomplete x86-${mode} branch: needs ${expectedLength} bytes, but only ${available} are available. No displacement or target can be determined.` };
    }
    return null;
  }
}
