import { rulerGeometry, roundRuler, INDENT_STEP, pxToIndentUnits, indentUnitsToPx, RULER_SNAP_PX } from './rulerMath';

describe('Nexa Docs ruler geometry', () => {
  it('supports previously saved documents with a single margin value', () => {
    const g = rulerGeometry({ width: 816, height: 1056, margin: 100 });
    expect([g.leftMargin, g.rightMargin, g.top, g.bottom]).toEqual([100, 100, 100, 100]);
    expect(g.right).toBe(716);
  });
  it('supports independent horizontal and vertical page margins', () => {
    const g = rulerGeometry({ width: 816, height: 1056, leftMargin: 72, rightMargin: 144, topMargin: 150, bottomMargin: 60 },
      { indent: 2, rightIndent: 30, firstLineIndent: 15 });
    expect([g.left, g.first, g.right, g.top, g.bottom]).toEqual([126, 141, 642, 150, 60]);
  });
  it('rounds ruler pointer values to fine increments', () => {
    expect(roundRuler(101)).toBe(102);
    expect(roundRuler(96)).toBe(96);
  });
});

// Patch 27: indent is stored in 27px toolbar units but draggable ruler uses 3px snaps.
// A 6px movement must no longer jump by a full 27px or disappear.
test('left-indent drag and other rulers share a 3px grid', () => {
  expect(RULER_SNAP_PX).toBe(3);
  expect(indentUnitsToPx(pxToIndentUnits(6))).toBeCloseTo(6, 4);
  expect(indentUnitsToPx(pxToIndentUnits(27))).toBeCloseTo(INDENT_STEP, 4);
  expect(pxToIndentUnits(8)).toBeCloseTo(pxToIndentUnits(9), 6);
});

test('new letter page defaults align to 1 and 7.5 inch ruler marks', () => {
  const g = rulerGeometry({width:816, height:1056, leftMargin:96, rightMargin:96});
  expect([g.left,g.first,g.right]).toEqual([96,96,720]);
});
