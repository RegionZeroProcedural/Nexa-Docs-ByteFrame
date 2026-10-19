import { decodeX86At } from './x86Decoder';
import { encodingByteDetails, instructionByteMap, instructionEffects, beginnerExplanation, analyzeNearbyPattern, traceKnownRegisters, nearbyInstructionWalkthrough } from './instructionInsights';

const decodeStream = raw => {
  const bytes = Uint8Array.from(raw);
  let pos = 0, instructions = [];
  while (pos < bytes.length) {
    const instruction = decodeX86At(bytes, pos);
    if (!instruction) throw new Error(`Unsupported test encoding at byte ${pos}`);
    instructions.push({ ...instruction, start:pos }); pos += instruction.size;
  }
  return instructions;
};

test('REX prefix, ModR/M and immediate receive independently accurate field explanations', () => {
  const raw = [0x48, 0x83, 0xC0, 0x05];
  const instruction = decodeX86At(Uint8Array.from(raw), 0);
  expect(instruction.mnemonic).toBe('ADD');
  expect(instruction.roles).toEqual(['prefix', 'opcode', 'modrm', 'immediate']);
  expect(encodingByteDetails(instruction, raw, 0).explanation).toMatch(/REX|64/);
  expect(encodingByteDetails(instruction, raw, 2).explanation).toMatch(/MOD=11.*REG=000.*R\/M=000/);
  expect(encodingByteDetails(instruction, raw, 3).explanation).toMatch(/0x5/);
  expect(instructionByteMap(instruction, raw, 4096)).toHaveLength(4);
});

test('developer effects and plain-English explanations retain distinct roles', () => {
  const [push] = decodeStream([0x55]);
  expect(beginnerExplanation(push)).toMatch(/stack/);
  expect(instructionEffects(push).join(' ')).toMatch(/RSP/);
  const [xor] = decodeStream([0x48, 0x31, 0xC0]);
  expect(beginnerExplanation(xor)).toMatch(/zero/);
});

test('bounded prologue and epilogue patterns are identified, not asserted as actual functions', () => {
  const prologue = decodeStream([0x55, 0x48, 0x89, 0xE5, 0x48, 0x83, 0xEC, 0x20]);
  expect(analyzeNearbyPattern(prologue, prologue[1].start)).toMatchObject({ label:'Possible function prologue' });
  expect(analyzeNearbyPattern(prologue.slice(1), prologue[1].start)).toBeNull();
  const epilogue = decodeStream([0xC9, 0xC3]);
  expect(analyzeNearbyPattern(epilogue, 0)?.label).toBe('Possible function epilogue');
});

test('compare/branch pattern is conditional and depends on flags', () => {
  const instructions = decodeStream([0x48, 0x83, 0xF8, 0x05, 0x74, 0x03]);
  expect(instructions.map(i => i.mnemonic)).toEqual(['CMP','JE']);
  expect(analyzeNearbyPattern(instructions, 4)?.caution).toMatch(/runtime/);
});

test('symbolic trace only derives values from proven immediate and self-XOR operations', () => {
  const instructions = decodeStream([0x48, 0x31, 0xC0, 0x48, 0x83, 0xC0, 0x05]);
  const trace = traceKnownRegisters(instructions, 3);
  expect(trace).toEqual([expect.objectContaining({ register:'RAX', before:'0', after:'5' })]);
  expect(traceKnownRegisters(decodeStream([0x48, 0x83, 0xC0, 0x05]), 0)).toEqual([]);
});

test('unidentified code does not receive invented explanations', () => {
  expect(beginnerExplanation(null)).toMatch(/cannot be identified/);
  expect(instructionEffects({ mnemonic:'Unknown / raw byte' })).toEqual([]);
});

test('nearby walkthrough respects gaps and never invents intervening instructions', () => {
  const instructions = decodeStream([0x55, 0x48, 0x89, 0xE5, 0x48, 0x83, 0xEC, 0x20]);
  const steps = nearbyInstructionWalkthrough(instructions, 1);
  expect(steps).toHaveLength(3);
  expect(steps.map(s => s.mnemonic)).toEqual(['PUSH','MOV','SUB']);
  expect(steps.filter(s => s.active)).toHaveLength(1);
  const withGap = [instructions[0], { ...instructions[1], start:10 }];
  expect(nearbyInstructionWalkthrough(withGap, 0)).toHaveLength(1);
});
