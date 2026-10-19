import { snapEmbedPosition } from './embedSnapping';
const page = { width: 816, height: 1056, marginLeft: 96, marginRight: 96, marginTop: 96, marginBottom: 96 };
const object = { width: 200, height: 120 };

test('snaps object left and top edges to writing margins', () => {
  const result = snapEmbedPosition({ x: 100, y: 89 }, object, page);
  expect(result.position).toEqual({ x: 96, y: 96 });
  expect(result.guides.map(g => g.label)).toEqual(['Left margin', 'Top margin']);
});
test('snaps right edge to the right writing margin', () => {
  const result = snapEmbedPosition({ x: 524, y: 234 }, object, page);
  expect(result.position.x).toBe(520);
});
test('snaps center of object to center of paper', () => {
  const result = snapEmbedPosition({ x: 312, y: 470 }, object, page);
  expect(result.position).toEqual({ x: 308, y: 468 });
});
test('can align to neighboring objects without changing the original data', () => {
  const other = { x: 240, y: 350, width: 160, height: 80 };
  const result = snapEmbedPosition({ x: 246, y: 357 }, object, page, [other]);
  expect(result.position).toEqual({ x: 240, y: 350 });
  expect(other).toEqual({ x: 240, y: 350, width: 160, height: 80 });
});
test('Alt-like disabled mode bypasses snapping but still clamps to paper', () => {
  const result = snapEmbedPosition({ x: 100, y: -200 }, object, page, [], { disabled: true });
  expect(result).toEqual({ position: { x: 100, y: 8 }, guides: [] });
});
test('positions remain on page when an object is larger than the page', () => {
  const result = snapEmbedPosition({ x: 12000, y: 12000 }, { width: 9000, height: 9000 }, page);
  expect(result.position).toEqual({ x: 8, y: 8 });
});
