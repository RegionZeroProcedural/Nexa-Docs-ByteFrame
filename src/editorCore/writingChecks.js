/** Local, deterministic checks; not a substitute for grammar or spellcheck. */
export function inspectWriting(text, limit = 100) {
  const results = [];
  const add = (start, end, message, replacement) => {
    if (results.length < limit) results.push({ start, end, message, replacement });
  };
  for (const match of text.matchAll(/\b([a-z]+)(\s+)\1\b/giu)) {
    add(match.index, match.index + match[0].length, 'Repeated word', match[1]);
  }
  for (const match of text.matchAll(/ {2,}/g)) add(match.index, match.index + match[0].length, 'Multiple consecutive spaces', ' ');
  for (const match of text.matchAll(/\s+([,.;!?])/g)) {
    if (match[0].includes('\n')) continue;
    add(match.index, match.index + match[0].length, 'Unexpected space before punctuation', match[1]);
  }
  return results.sort((a,b)=>a.start-b.start).filter((it,i,arr)=>i===0 || it.start>=arr[i-1].end);
}
/** Bounded, readable comparison for local files, not a semantic word-level diff. */
export function compareLines(a, b, max = 200) {
  const left = a.split('\n'), right = b.split('\n');
  const out = [];
  for(let i=0;i<Math.max(left.length,right.length) && out.length<max;i++) {
    if(left[i]!==right[i]) out.push({line:i+1, current:left[i]??'(missing)', incoming:right[i]??'(missing)'});
  }
  return { changes:out, truncated:Math.max(left.length,right.length)>max && out.length>=max };
}
