import { analyzeByteText, selectedByteAnalysis } from './byteAnalysis';

test('x86-64 register ADD with REX.W prefix is decoded and each role located', () => {
  const analyzed = analyzeByteText('48 83 C0 05');
  expect(analyzed.groups).toHaveLength(1);
  expect(analyzed.groups[0]).toMatchObject({ mnemonic: 'ADD', operands: 'RAX, 5', category: 'arithmetic' });
  expect(analyzed.tokens.map(t => t.role)).toEqual(['prefix', 'opcode', 'modrm', 'immediate']);
  const selected = selectedByteAnalysis(analyzed, { anchor: 10, start: 10, end: 10 });
  expect(selected.token.role).toBe('immediate');
});

test('compact hex and register MOV mnemonics are recognized', () => {
  const analyzed = analyzeByteText('4883C005\nmov rax, rbx');
  expect(analyzed.groups.some(g => g.mnemonic === 'ADD')).toBe(true);
  expect(analyzed.groups.some(g => g.mnemonic === 'MOV' && g.kind === 'assembly')).toBe(true);
});

test('ordinary prose is not blindly interpreted as machine instructions', () => {
  const analyzed = analyzeByteText('Please add a subtitle to the current page.');
  expect(analyzed.groups).toHaveLength(0);
});

test('decodes common memory-addressing, stack, control flow and syscall opcodes', () => {
  const analyzed = analyzeByteText('55 48 89 E5 48 83 EC 20 48 8B 45 F8 5D C3');
  expect(analyzed.groups.map(g => g.mnemonic)).toEqual(['PUSH','MOV','SUB','MOV','POP','RET']);
  expect(analyzed.groups[3].operands).toBe('RAX, [RBP-0x8]');
  expect(analyzeByteText('0F 05').groups[0].mnemonic).toBe('SYSCALL');
  expect(analyzeByteText('0F 84 10 00 00 00').groups[0].mnemonic).toBe('JE');
});

test('file headers are treated as data rather than randomly disassembled', () => {
  const hex = '4D 5A ' + Array.from({ length: 70 }, () => '00').join(' ');
  const analysis = analyzeByteText(hex);
  expect(analysis.structure.format).toMatch(/PE/);
  expect(analysis.groups[0].category).toBe('structure');
});
