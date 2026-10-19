import { documentLines, paginateLines, groupColumns } from './pagination';
import { makeBlankDocument, validateDocument } from '../../editorCore/documentModel';
import { rulerGeometry } from './rulerMath';

const measure = p => (p.end - p.start > 0 ? 20 : 20);

test('default 8.5 inch page anchors are at 1 and 7.5 inches', () => {
  const d=makeBlankDocument();const geometry=rulerGeometry(d.pageSettings);
  expect(geometry.left).toBe(96);expect(geometry.first).toBe(96);expect(geometry.right).toBe(720);
});
test('old untouched factory 100px margins migrate once; custom margins stay', () => {
  const prior={...makeBlankDocument(), pageSettings:{width:816,height:1056,margin:100,leftMargin:100,rightMargin:100,topMargin:100,bottomMargin:100}};
  expect(validateDocument(prior).pageSettings.leftMargin).toBe(96);
  prior.pageSettings.leftMargin=72;
  expect(validateDocument(prior).pageSettings.leftMargin).toBe(72);
});
test('explicit page breaks start a new page even with available space', () => {
  const raw='first\nsecond\nthird';
  const pages=paginateLines(raw,100,measure,50,{breakBefore:i=>i===1});
  expect(pages.length).toBe(2);
  expect(pages[1].forced).toBe(true);
  expect(pages.flatMap(p=>p.fragments.map(f=>raw.slice(f.start,f.end)))).toEqual(['first','second','third']);
});
test('multi-column pagination groups flow columns and honors forced page boundaries', () => {
  const raw='one\ntwo\nthree\nfour\nfive';
  const flow=paginateLines(raw,40,measure,50,{breakBefore:i=>i===3});
  const pages=groupColumns(flow,2);
  expect(pages.length).toBeGreaterThanOrEqual(2);
  expect(pages.every(p=>p.columns.length<=2)).toBe(true);
  expect(pages.flatMap(p=>p.columns).flatMap(c=>c.fragments).map(f=>raw.slice(f.start,f.end))).toEqual(['one','two','three','four','five']);
});
