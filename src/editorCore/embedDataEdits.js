/** Immutable floating-media updates. Rendering and storage use the same shape. */
export function updateTableCell(item, rowIndex, columnIndex, value) {
  if (item?.type !== 'table' || !Array.isArray(item.rows) ||
      !Array.isArray(item.rows[rowIndex]) || columnIndex < 0 ||
      columnIndex >= item.rows[rowIndex].length) return null;
  return { rows: item.rows.map((row,i) => i === rowIndex ?
    row.map((cell,j) => j === columnIndex ? String(value).slice(0,600) : cell) : [...row]) };
}

export function updateChartPoint(item, index, changes) {
  if (item?.type !== 'chart' || !Array.isArray(item.points) || !item.points[index]) return null;
  if ('value' in changes && !Number.isFinite(Number(changes.value))) return null;
  return { points: item.points.map((pt,i) => i === index ? {
    ...pt,
    ...('label' in changes ? { label:String(changes.label).slice(0,90) } : {}),
    ...('value' in changes ? { value:Number(changes.value) } : {}),
  } : { ...pt }) };
}
