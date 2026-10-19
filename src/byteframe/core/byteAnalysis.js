import { decodeX86At, instructionCategory } from './x86Decoder';
import { extractBinaryPrefix, inspectBinaryStructure } from './binaryStructure';
import { resolveRelativeTarget } from './addressMapping';
/** One authoritative decoder for binary files and pasted hex.  Other languages
 * remain colorized lexically without being misrepresented as machine code. */
const hex = value => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
const categoryFor = instructionCategory;

const REG_HEX_SEQUENCE = /(?<![\w])(?:0[xX])?[\da-fA-F]{2}(?:[ \t]+(?:0[xX])?[\da-fA-F]{2}){2,}(?![\w])/g;
const REG_COMPACT_HEX = /(?<![\w])(?:0[xX])?(?=[\da-fA-F]{8,}(?![\w]))[\da-fA-F]{8,}(?![\w])/g;
function describeByte(part) {
  switch (part) {
    case 'prefix': return 'Instruction prefix: changes operand width or register selection.';
    case 'opcode': return 'Opcode: identifies the processor operation.';
    case 'sib': return 'SIB: specifies scale, index and base registers for a memory address.';
    case 'structure': return 'Structural file data rather than a confirmed machine instruction.';
    case 'modrm': return 'ModR/M: encodes registers and/or an addressing mode.';
    case 'immediate': return 'Immediate data: a constant encoded within the instruction.';
    case 'displacement': return 'Displacement: a relative branch or address offset.';
    default: return 'Raw byte. A supported machine instruction was not recognized here.';
  }
}
/** Return pre-computed absolute UTF-16 positions for inline decoration and inspector. */
export function analyzeByteText(text) {
  const tokens = [], groups = [];
  if (typeof text !== 'string' || !text) return { tokens, groups, structure: null, truncated: false };
  const LIMIT = 250_000;
  const prefix = extractBinaryPrefix(text.slice(0, LIMIT));
  const structure = inspectBinaryStructure(prefix.bytes, prefix.sourcePositions);
  // Preview cap bounds browser-side analysis work.
  const source = text.slice(0, LIMIT);
  // When an actual file signature is present, the hex dump's offset labels
  // are NOT machine bytes. Decode only bytes mapped by the explicit dump parser.
  // Only regions flagged executable by parsed file headers are disassembled;
  // an arbitrary byte in a DOS/ELF/PNG header is structural data, not code.
  if (structure.format) {
    const b = prefix.bytes, positions = prefix.sourcePositions;
    for (let at = 0; at < b.length;) {
      const region = structure.sections.find(section => at >= section.start && at < section.start + section.size);
      const code = region?.kind === 'code';
      const supportedCode = code && [16,32,64].includes(structure.architecture?.mode);
      const decoded = supportedCode
        ? decodeX86At(b, at, {mode:structure.architecture.mode}) : null;
      const size = decoded && at + decoded.size <= region.start + region.size ? decoded.size : 1;
      const groupId = `hex-${positions[at]}`;
      const groupTokens = [];
      const category = supportedCode ? decoded?.category || 'unknown' : 'structure';
      for (let i = 0; i < size; i++) {
        const start = positions[at + i];
        const length = source.slice(start, start + 2).toLowerCase() === '0x' ? 4 : 2;
        const role = supportedCode ? decoded?.roles[i] || 'unknown' : 'structure';
        const token = { id:`byte-${start}`, kind:'byte', start, end:start+length,
          text:source.slice(start,start+length), value:b[at+i], role, groupId,
          category, roleDescription:describeByte(role) };
        tokens.push(token); groupTokens.push(token);
      }
      const label = region?.name || 'Unclassified bytes';
      groups.push({ id:groupId, kind:supportedCode?'machine':'structure', start:groupTokens[0].start,
        end:groupTokens[groupTokens.length-1].end, mnemonic:supportedCode ? decoded?.mnemonic || 'Unknown / raw byte' : label,
        operands:decoded?.operands || '', category,
        explanation:supportedCode ? decoded?.explanation || 'The byte is within an executable region, but this encoding was not decoded.' :
          `File data ${region ? `inside ${region.name} (${region.kind})` : 'outside a labeled region'}.${code && !supportedCode ? ' Its architecture is not supported by this decoder.' : ''} No instruction execution is implied.`,
        bytes:groupTokens.map(t=>t.text).join(' '), tokens:groupTokens, byteStart:at, byteSize:size, architectureMode:structure.architecture?.mode,
        displacement:decoded?.displacement, displacementWidth:decoded?.displacementWidth, incomplete:!!decoded?.incomplete,
        mode:decoded?.mode, size, roles:decoded?.roles,
        resolvedTarget:decoded?.displacement !== undefined ? resolveRelativeTarget(structure, at, decoded) : null });
      at += size;
    }
    return { tokens, groups, structure, truncated:text.length > LIMIT };
  }
  const separated = [...source.matchAll(new RegExp(REG_HEX_SEQUENCE.source, 'g'))];
  let matchPointer = 0;
  const compact = [...source.matchAll(new RegExp(REG_COMPACT_HEX.source, 'g'))]
    .filter(match => {
      while (matchPointer < separated.length && separated[matchPointer].index + separated[matchPointer][0].length <= match.index) matchPointer++;
      const overlapping = matchPointer < separated.length && match.index >= separated[matchPointer].index && match.index < separated[matchPointer].index + separated[matchPointer][0].length;
      return !overlapping && match[0].replace(/^0[xX]/, '').length % 2 === 0 && /\d/.test(match[0]);
    });
  const matches = [...separated, ...compact];
  const compactMatches = new Set(compact);
  // Whole-line one- or two-byte snippets are valid machine code too. This
  // strict line matcher avoids turning ordinary prose containing 'a0' into opcodes.
  let wholeLineOffset = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (/^(?:(?:0x)?[\da-fA-F]{2})(?:[ \t]+(?:0x)?[\da-fA-F]{2})?$/.test(trimmed) &&
        !matches.some(m => m.index < wholeLineOffset + line.length && m.index + m[0].length > wholeLineOffset)) {
      matches.push({ 0:trimmed, index:wholeLineOffset + line.indexOf(trimmed) });
    }
    wholeLineOffset += line.length + 1;
  }
  matches.sort((a, b) => a.index - b.index);
  for (const match of matches) {
    const value = match[0], start = match.index;
    const matched = compactMatches.has(match)
      ? [...value.replace(/^0[xX]/, '').matchAll(/[\da-fA-F]{2}/g)].map(m => ({ 0:m[0], index:m.index + (value.length - value.replace(/^0[xX]/, '').length) }))
      : [...value.matchAll(/(?:0[xX])?[\da-fA-F]{2}/g)];
    const bytes = Uint8Array.from(matched.map(m => parseInt(m[0].replace(/^0x/i, ''), 16)));
    if (!bytes.length) continue;
    let position = 0;
    while (position < bytes.length) {
      const decoded = decodeX86At(bytes, position, {mode:64});
      const size = decoded?.size || 1;
      const groupId = `hex-${start + matched[position].index}`;
      const groupTokens = [];
      for (let i = 0; i < size; i++) {
        const entry = matched[position + i];
        const role = decoded?.roles[i] || 'unknown';
        const token = { id:`byte-${start + entry.index}`, kind:'byte',
          start:start + entry.index, end:start + entry.index + entry[0].length,
          text:entry[0], value:bytes[position+i], role, groupId,
          category:decoded?.category || 'unknown',
          roleDescription:describeByte(role) };
        tokens.push(token); groupTokens.push(token);
      }
      const first = groupTokens[0], last = groupTokens[groupTokens.length - 1];
      groups.push({ id:groupId, kind:'machine', start:first.start, end:last.end,
        mnemonic:decoded?.mnemonic || 'Unknown / raw byte',
        operands:decoded?.operands || '', category:decoded?.category || 'unknown',
        explanation: decoded?.explanation || `Byte ${hex(bytes[position])} was not decoded as a supported x86-64 instruction. It may be data, an unsupported instruction or part of an instruction with a memory operand.`,
        bytes:groupTokens.map(t => t.text).join(' '), tokens:groupTokens, byteStart:start + position, byteSize:size, snippetStart:start,
        architectureMode:64, displacement:decoded?.displacement, displacementWidth:decoded?.displacementWidth,
        incomplete:!!decoded?.incomplete, mode:decoded?.mode, size, roles:decoded?.roles });
      position += size;
    }
  }
  // Recognize standalone assembly mnemonics on non-hex lines. The mnemonic is
  // colorized, but operands aren't falsely parsed as arbitrary machine bytes.
  let lineOffset = 0;
  for (const line of source.split('\n')) {
    const assembly = /^\s*(?:(?:0x)?[0-9a-fA-F]{4,16}:?\s+)?(MOV|MOVZX|MOVSX|MOVSXD|LEA|ADD|ADC|SUB|SBB|CMP|TEST|XOR|AND|OR|INC|DEC|NEG|SHL|SHR|SAR|IMUL|MUL|DIV|IDIV|JMP|JE|JNE|JZ|JNZ|JA|JB|JG|JL|CALL|RET|PUSH|POP|NOP|INT3|SYSCALL|CPUID|RDTSC|LEAVE)\b(?:\s+([^;#]*))?/i.exec(line);
    if (assembly && (
      ['RET', 'NOP', 'INT3', 'SYSCALL', 'CPUID', 'RDTSC', 'LEAVE'].includes(assembly[1].toUpperCase()) ||
      /^(?:\[|(?:[RE](?:AX|BX|CX|DX|SI|DI|SP|BP)|R(?:1[0-5]|[89]))\b|(?:0x)?[0-9]+\b|[A-Za-z_$][\w$.]*:)/i.test((assembly[2] || '').trim()) ||
      /^(?:J[A-Z]*|CALL)\b/i.test(assembly[1]) && Boolean((assembly[2] || '').trim())
    )) {
      const mnemonic = assembly[1].toUpperCase();
      const offset = lineOffset + line.indexOf(assembly[1], assembly.index);
      if (!tokens.some(t => t.start <= offset && t.end > offset)) {
        const category = categoryFor(mnemonic), operands = (assembly[2] || '').trim();
        const description = ({ MOVSXD:'Sign-extends a 32-bit signed operand to 64 bits.', ADC:'Adds two operands including the carry flag.', SBB:'Subtracts with borrow from the carry flag.', TEST:'Performs bitwise AND and updates flags without storing a result.', INC:'Increments an operand.', DEC:'Decrements an operand.', NEG:'Negates an operand.', SHL:'Shifts bits left.', SHR:'Shifts bits right logically.', SAR:'Shifts bits right preserving the sign.', IMUL:'Performs signed multiplication.', MUL:'Performs unsigned multiplication.', DIV:'Performs unsigned division.', IDIV:'Performs signed division.', SYSCALL:'Transfers to an operating-system kernel service, depending on register arguments.', CPUID:'Queries processor identity and capabilities.', RDTSC:'Reads the timestamp counter.', LEAVE:'Restores the previous stack frame.', MOVZX:'Copies a smaller unsigned value into a larger register, filling high bits with zero.', MOVSX:'Sign-extends a smaller source value.', LEA:'Computes an effective memory address without loading its value.', MOV:'Copies or loads a value.', ADD:'Adds two operands.', SUB:'Subtracts an operand.', CMP:'Compares operands and sets flags.', XOR:'Applies bitwise exclusive OR.', AND:'Applies bitwise AND.', OR:'Applies bitwise OR.', JMP:'Transfers execution to a target.', JE:'Branches when the zero flag is set.', JNE:'Branches when the zero flag is clear.', CALL:'Calls a routine and records a return address.', RET:'Returns from a routine.', PUSH:'Places a value onto the stack.', POP:'Removes a value from the stack.', NOP:'Performs no operation.', INT3:'Raises a breakpoint exception.' })[mnemonic];
        const token = { id:`asm-${offset}`, kind:'assembly', start:offset, end:offset + mnemonic.length, text:assembly[1],
          role:'opcode', category, groupId:`asm-${offset}`, roleDescription:'Assembly mnemonic: a human-readable instruction name.' };
        tokens.push(token);
        groups.push({ id:token.groupId, kind:'assembly', start:token.start, end:token.end, tokens:[token], mnemonic,
          operands, category, explanation:`${description || 'Assembly operation recognized.'} Exact behavior depends on the operands and execution state.`, bytes:'' });
      }
    }
    lineOffset += line.length + 1;
  }
  tokens.sort((a,b) => a.start-b.start);
  groups.sort((a,b) => a.start-b.start);
  return { tokens, groups, structure, truncated: text.length > LIMIT };
}
function locateByPosition(items, pos) {
  let lo = 0, hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, item = items[mid];
    if (pos < item.start) hi = mid - 1;
    else if (pos >= item.end) lo = mid + 1;
    else return item;
  }
  return null;
}
export function selectedByteAnalysis(analysis, selection) {
  if (!analysis?.tokens?.length || !selection) return null;
  const pos = selection.anchor ?? selection.start;
  let found = locateByPosition(analysis.tokens, pos);
  if (!found && selection.start !== selection.end) found = locateByPosition(analysis.tokens, selection.start);
  // In HTML contentEditable, a collapsed selection often lands just after the byte.
  if (!found && pos > 0) found = locateByPosition(analysis.tokens, pos - 1);
  if (!found) return null;
  const group = locateByPosition(analysis.groups, found.start);
  return { token: found, group: group?.id === found.groupId ? group : analysis.groups.find(g => g.id === found.groupId) };
}
