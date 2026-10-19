import { PRIVACY, TERMS, NEEDS_OPERATOR } from './policies';
test('policy drafts are structured and clearly require prelaunch review', () => {
  expect(PRIVACY.length).toBeGreaterThan(5);
  expect(TERMS.length).toBeGreaterThan(5);
  expect(NEEDS_OPERATOR).toMatch(/contact/);
  for (const [heading, body] of [...PRIVACY, ...TERMS]) {
    expect(heading.length).toBeGreaterThan(3);
    expect(body.length).toBeGreaterThan(20);
  }
});
