/* global BigInt: readonly */
/** ByteFrame teaching / static-inspection layer.
 * Never executes data. All conclusions are limited to decoded instructions,
 * mode assumptions and the bytes presently available in the viewer.
 */
const REGISTER64 = /^(?:R(?:AX|BX|CX|DX|SI|DI|SP|BP|[89]|1[0-5]))$/;
const DECIMAL_OR_HEX = /^(?:-?(?:0x[0-9a-f]+|\d+))$/i;
const FLOW = /^(?:J[A-Z0-9]*|LOOP[A-Z]*|CALL|RET|RETF|SYSCALL|INT\d*|HLT)$/;
const arithmetic = /^(?:ADD|ADC|SUB|SBB|XOR|OR|AND|SHL|SHR|SAR|ROL|ROR|INC|DEC)$/;

function operandsOf(value) {
  // Commas inside [] are not operand boundaries.
  let depth = 0, part = '', parts = [];
  for (const character of String(value || '')) {
    if (character === '[') depth++;
    if (character === ']') depth--;
    if (character === ',' && depth === 0) { parts.push(part.trim().toUpperCase()); part = ''; }
    else part += character;
  }
  if (part.trim()) parts.push(part.trim().toUpperCase());
  return parts;
}
function hex(value) { return `0x${value.toString(16).toUpperCase()}`; }
function asNumber(value) {
  if (!DECIMAL_OR_HEX.test(String(value || ''))) return null;
  const n = /^-?0x/i.test(value) ? (value.startsWith('-') ? -Number.parseInt(value.slice(3), 16) : Number.parseInt(value.slice(2), 16)) : Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
function littleEndian(bytes) {
  if (!bytes.length || bytes.length > 8) return null;
  let value = 0n;
  bytes.forEach((byte, i) => { value |= BigInt(byte) << BigInt(i * 8); });
  return `0x${value.toString(16).toUpperCase()}`;
}
function signedImm(bytes) {
  if (!bytes.length || bytes.length > 4) return null;
  let val = 0;
  bytes.forEach((byte, i) => { val += byte * 2 ** (8 * i); });
  const shift = 32 - 8 * bytes.length;
  return (val << shift) >> shift;
}

export const EXPLANATION_LEVELS = Object.freeze([
  { id: 'beginner', label: 'Beginner' },
  { id: 'developer', label: 'Developer' },
  { id: 'advanced', label: 'Advanced' },
]);

/** Explain one exact encoding byte, without claiming to know the runtime state. */
export function encodingByteDetails(instruction, bytes, index) {
  const role = instruction?.roles?.[index] || 'unknown';
  const value = bytes[index];
  if (!Number.isInteger(value)) return { role, title:'Unavailable', explanation:'This byte has not been loaded.' };
  if (role === 'prefix') {
    if (value >= 0x40 && value <= 0x4f) {
      const flags = [value & 8 ? 'W=1: select a 64-bit operand' : 'W=0: default operand size', value & 4 ? 'R=1: extend the ModR/M reg field' : 'R=0: no reg extension', value & 2 ? 'X=1: extend the SIB index field' : 'X=0: no index extension', value & 1 ? 'B=1: extend base or opcode register' : 'B=0: no base extension'];
      return { role, title:'REX prefix', explanation:`${hex(value)} alters operand width and available register numbers in 64-bit mode (not a REX prefix in 16/32-bit modes).`, bits:flags.join(' · ') };
    }
    const titles = { 0x66:'Operand-size override', 0x67:'Address-size override', 0xf3:'REP / mandatory prefix', 0xf2:'REPNE / mandatory prefix' };
    return { role, title:titles[value] || 'Instruction prefix', explanation:'This byte modifies the interpretation of the following instruction. Its precise effect depends on the opcode.' };
  }
  if (role === 'opcode') return { role, title:'Operation selector', explanation:`${hex(value)} helps identify ${instruction?.mnemonic || 'the instruction'}. Some x86 operations use more than one opcode byte, and ModR/M bits can select a sub-operation.` };
  if (role === 'modrm') {
    const mod = value >> 6, reg = (value >> 3) & 7, rm = value & 7;
    return { role, title:'ModR/M fields', explanation:`MOD=${mod.toString(2).padStart(2, '0')} (${mod === 3 ? 'register operand' : 'memory addressing'}), REG=${reg.toString(2).padStart(3, '0')}, R/M=${rm.toString(2).padStart(3, '0')}.`, bits:'MOD · REG/OPCODE · R/M = 2 + 3 + 3 bits; prefixes may extend register numbers.' };
  }
  if (role === 'sib') {
    const scale = 1 << (value >> 6), idx = (value >> 3) & 7, base = value & 7;
    return { role, title:'Scale / index / base', explanation:`SCALE=${scale}, INDEX field=${idx}, BASE field=${base}. These fields participate in a memory address; special encodings and REX prefixes change their interpretation.`, bits:'SCALE · INDEX · BASE = 2 + 3 + 3 bits.' };
  }
  if (role === 'immediate' || role === 'displacement') {
    // Gather *consecutive* same-role bytes so multi-byte values are not misrepresented.
    let from = index, to = index + 1;
    while (from && instruction.roles[from - 1] === role) from--;
    while (to < bytes.length && instruction.roles[to] === role) to++;
    const data = bytes.slice(from, to);
    const aggregate = littleEndian(data);
    const signed = signedImm(data);
    return { role, title: role === 'immediate' ? 'Embedded constant' : 'Relative / memory displacement', explanation:
      `${hex(value)} (unsigned byte ${value}; signed 8-bit ${value > 127 ? value - 256 : value}) is byte ${index - from + 1} of ${data.length} in this ${role} field. The single-byte signed value does NOT determine the complete operand when the field spans multiple bytes.${aggregate ? ` Combined little-endian field: ${aggregate}.` : ''}${signed !== null && role === 'displacement' ? ` Signed value: ${signed}.` : ''}`, bits: role === 'displacement' ? 'Branch-relative displacements are measured from the next instruction.' : 'Immediate values are encoded within the instruction; width and sign extension depend on the opcode.' };
  }
  return { role, title:'Unclassified byte', explanation:'This byte has no verified interpretation in the available x86-64 decoder. It may be data or an unsupported instruction.' };
}

/** Conservative effects inferred from the decoded instruction, not live execution. */
export function instructionEffects(instruction) {
  if (!instruction || !instruction.mnemonic || instruction.mnemonic === 'Unknown / raw byte') return [];
  const m = instruction.mnemonic.toUpperCase();
  const [destination, source] = operandsOf(instruction.operands);
  const effects = [];
  if (m === 'MOV' || m === 'MOVZX' || m === 'MOVSX' || m === 'MOVSXD') effects.push(`Writes ${destination || 'the destination'} using ${source || 'the source'}${m === 'MOV' ? '' : ' with extension'}.`);
  else if (m === 'LEA') effects.push(`Computes the effective address ${source || ''} and writes it to ${destination || 'the destination'}, without reading that memory.`);
  else if (m === 'CMP' || m === 'TEST') effects.push('Updates condition flags; does not write a result to its operands.');
  else if (m === 'XOR' && destination && destination === source && REGISTER64.test(destination)) effects.push(`Sets ${destination} to zero (register self-XOR).`);
  else if (arithmetic.test(m)) effects.push(`Updates ${destination || 'the destination'}; processor flag effects depend on the operation.`);
  else if (m === 'PUSH') effects.push(`Pushes a value to the stack using ${instruction.mode || 64}-bit execution mode semantics (operand width may be overridden).`);
  else if (m === 'POP') effects.push(`Pops a value from the stack using ${instruction.mode || 64}-bit execution mode semantics (operand width may be overridden).`);
  else if (m === 'CALL') effects.push('Saves a return address and transfers control to a call target.');
  else if (m === 'RET') effects.push('Loads a return address from the stack and transfers control to it.');
  else if (m === 'SYSCALL') effects.push('Transitions to a kernel entry point; the requested service depends on the ABI and register state.');
  else if (m === 'NOP') effects.push('No architectural data change from this no-operation instruction.');
  else if (m.startsWith('J') || m.startsWith('LOOP')) effects.push('May transfer control based on flags/counter, or transfers unconditionally for JMP.');
  else if (instruction.explanation) effects.push(instruction.explanation);
  if (m === 'ADD' || m === 'SUB' || m === 'CMP' || m === 'TEST' || m === 'XOR') effects.push('Arithmetic condition flags may change; some flags are operation-specific.');
  return effects;
}

export function beginnerExplanation(instruction) {
  if (!instruction?.mnemonic || instruction.mnemonic === 'Unknown / raw byte') return 'This byte cannot be identified confidently as an instruction. It may be program data or an unsupported encoding.';
  const m = instruction.mnemonic.toUpperCase();
  const [dst, src] = operandsOf(instruction.operands);
  if (m === 'MOV') return `Copy ${src || 'a value'} into ${dst || 'the destination'}. The original source is not erased.`;
  if (m === 'ADD') return `Add ${src || 'the source value'} to ${dst || 'the destination'} and store the sum in the destination.`;
  if (m === 'SUB') return `Subtract ${src || 'the source value'} from ${dst || 'the destination'} and store the result.`;
  if (m === 'XOR' && dst && dst === src) return `Set ${dst} to zero by XORing it with itself.`;
  if (m === 'PUSH') return `Place ${dst || 'a value'} on the processor's stack.`;
  if (m === 'POP') return `Take a value off the stack and place it in ${dst || 'the destination'}.`;
  if (m === 'CMP') return `Compare ${dst || 'two values'} and ${src || 'another value'} so a later instruction can check the result.`;
  if (m === 'CALL') return 'Jump into a routine while remembering where to return afterward.';
  if (m === 'RET') return 'Return from a routine to the saved location.';
  if (/^J/.test(m)) return m === 'JMP' ? 'Continue executing at another location.' : 'Possibly jump to another location if the required condition is true.';
  return instruction.explanation || `The processor performs ${m}. Its effect depends on the operands and CPU state.`;
}

/** Identify adjacent instruction patterns only; not a function-discovery algorithm. */
export function analyzeNearbyPattern(sequence = [], activeStart) {
  const instructions = sequence.filter(i => i && Number.isSafeInteger(i.start) && i.size > 0 && i.mnemonic && i.mnemonic !== 'Unknown / raw byte')
    .sort((a,b) => a.start-b.start);
  const at = instructions.findIndex(i => i.start === activeStart || activeStart >= i.start && activeStart < i.start + i.size);
  if (at < 0) return null;
  const connected = (a,b) => a && b && a.start + a.size === b.start;
  for (let j = Math.max(0, at - 2); j <= at; j++) {
    const a = instructions[j], b = instructions[j+1], c = instructions[j+2];
    if (a && b && c && connected(a,b) && connected(b,c) && at >= j && at <= j+2 &&
        a.mnemonic === 'PUSH' && a.operands === 'RBP' &&
        b.mnemonic === 'MOV' && /^RBP, RSP$/i.test(b.operands) &&
        c.mnemonic === 'SUB' && /^RSP,\s*(?:0x[\da-f]+|\d+)$/i.test(c.operands)) {
      return { label:'Possible function prologue', summary:'Saves the prior frame pointer, establishes a new frame pointer, and reserves stack space.',
        caution:'A common compiler pattern, not proof of a function boundary.', offsets:[a.start,b.start,c.start] };
    }
    if (a && b && connected(a,b) && at >= j && at <= j+1 && a.mnemonic === 'CMP' && /^J(?!MP|RCXZ)[A-Z]+/.test(b.mnemonic))
      return { label:'Compare followed by conditional branch', summary:`CMP sets status flags; ${b.mnemonic} may transfer control depending on them.`, caution:'Whether the branch is taken depends on register/memory contents at runtime.', offsets:[a.start,b.start] };
    if (a && b && connected(a,b) && at >= j && at <= j+1 && a.mnemonic === 'XOR' &&
        operandsOf(a.operands).length === 2 && operandsOf(a.operands)[0] === operandsOf(a.operands)[1] &&
        REGISTER64.test(operandsOf(a.operands)[0]) && b.mnemonic === 'ADD' && operandsOf(b.operands)[0] === operandsOf(a.operands)[0])
      return { label:'Register initialization and addition', summary:'A register is cleared, then incremented by a subsequent instruction.', caution:'Assumes control reaches both instructions in sequence.', offsets:[a.start,b.start] };
    if (a && b && connected(a,b) && at >= j && at <= j+1 && a.mnemonic === 'LEAVE' && b.mnemonic === 'RET')
      return { label:'Possible function epilogue', summary:'The stack frame is restored before returning to the caller.', caution:'Common epilogue pattern, not proof of a function boundary.', offsets:[a.start,b.start] };
  }
  return null;
}

/** Optional, tightly bounded symbolic example for 64-bit register immediates.
 * Does not use unknown register inputs or guess branch outcomes. */
export function traceKnownRegisters(sequence = [], activeStart) {
  const instructions = sequence.filter(i => i && Number.isSafeInteger(i.start) && i.size > 0 && i.mnemonic)
    .sort((a,b) => a.start-b.start);
  const activeIndex = instructions.findIndex(i => i.start <= activeStart && i.start + i.size > activeStart);
  if (activeIndex < 0) return [];
  const startIndex = Math.max(0, activeIndex - 7);
  const known = new Map();
  const results = [];
  for (let j = startIndex; j <= activeIndex; j++) {
    const item = instructions[j];
    if (j > startIndex && instructions[j-1].start + instructions[j-1].size !== item.start) known.clear();
    const [dst, src] = operandsOf(item.operands);
    const validDst = REGISTER64.test(dst || '');
    const before = validDst ? known.get(dst) : undefined;
    let after = null;
    if (validDst) {
      if (item.mnemonic === 'MOV') after = asNumber(src);
      else if (item.mnemonic === 'XOR' && dst === src) after = 0;
      else if (item.mnemonic === 'ADD' || item.mnemonic === 'SUB') {
        const amount = asNumber(src);
        if (before !== undefined && amount !== null) after = before + (item.mnemonic === 'ADD' ? amount : -amount);
      }
      if (after !== null && Number.isSafeInteger(after)) known.set(dst, after);
      else known.delete(dst);
    }
    // Control flow breaks the validity of a straight-line trace.
    if (FLOW.test(item.mnemonic)) known.clear();
    if (j === activeIndex && validDst && after !== null && Number.isSafeInteger(after))
      results.push({ register: dst, before: before === undefined ? 'unknown' : String(before), after: String(after),
        assumption:'Only literal constants and 64-bit register self-XOR are tracked. This is a hypothetical straight-line result, not a running process.' });
  }
  return results;
}

export function instructionByteMap(instruction, bytes, start = 0) {
  return Array.from(bytes || [], (value, index) => ({ ...encodingByteDetails(instruction, bytes, index), value, index, offset:start+index }));
}

/** Bounded, contiguous neighbors for a readable static walkthrough.
 * Adjacency alone never proves that the code is reachable or executed. */
export function nearbyInstructionWalkthrough(sequence = [], activeStart, radius = 2) {
  const sorted = sequence.filter(i => i && Number.isSafeInteger(i.start) && i.size > 0 && i.mnemonic && i.mnemonic !== 'Unknown / raw byte')
    .sort((a,b) => a.start - b.start);
  const i = sorted.findIndex(item => activeStart >= item.start && activeStart < item.start + item.size);
  if (i < 0) return [];
  const limit = Math.max(0, Math.min(3, Math.floor(Number(radius) || 0)));
  let first = i, last = i;
  while (first > 0 && i - first < limit && sorted[first-1].start + sorted[first-1].size === sorted[first].start) first--;
  while (last < sorted.length-1 && last - i < limit && sorted[last].start + sorted[last].size === sorted[last+1].start) last++;
  return sorted.slice(first, last + 1).map(item => ({ ...item, plainEnglish: beginnerExplanation(item), active: item.start === sorted[i].start }));
}
