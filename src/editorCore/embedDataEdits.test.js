import { updateTableCell, updateChartPoint } from './embedDataEdits';

test('editing one table cell leaves the rest of the table and source unchanged', () => {
  const item = { type:'table',rows:[['Title','Value'],['Alpha','10'],['Beta','20']] };
  const result = updateTableCell(item,1,1,'99');
  expect(result.rows).toEqual([['Title','Value'],['Alpha','99'],['Beta','20']]);
  expect(item.rows[1][1]).toBe('10');
  expect(result.rows[0]).not.toBe(item.rows[0]);
});
test('table edits are bounded and reject invalid indices', () => {
  const item = { type:'table',rows:[['A']] };
  expect(updateTableCell(item,3,0,'x')).toBeNull();
  expect(updateTableCell(item,0,0,'x'.repeat(1000)).rows[0][0]).toHaveLength(600);
});
test('editing a chart label preserves numeric values and other labels', () => {
  const item = { type:'chart',points:[{label:'A',value:3},{label:'B',value:5}] };
  const result = updateChartPoint(item,0,{label:'Sales'});
  expect(result.points).toEqual([{label:'Sales',value:3},{label:'B',value:5}]);
  expect(item.points[0].label).toBe('A');
});
test('editing a chart value produces numeric data with no mutation', () => {
  const item = { type:'chart',points:[{label:'A',value:3}] };
  const result = updateChartPoint(item,0,{value:12.5});
  expect(result.points).toEqual([{label:'A',value:12.5}]);
  expect(item.points[0].value).toBe(3);
  expect(updateChartPoint(item,0,{value:'bad'})).toBeNull();
});
