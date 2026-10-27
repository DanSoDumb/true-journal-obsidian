// ---------- logic tree (a nested bullet list drawn as a tree) ----------

/** Markdown nested bullets -> [{ text, children }]. Anything that is not a bullet is ignored. */
function parseOutline(text) {
  const roots = [];
  const stack = []; // [{ indent, node }]
  for (const raw of String(text).split('\n')) {
    const m = raw.match(/^([ \t]*)[-*+]\s+(.*)$/);
    if (!m || !m[2].trim()) continue;
    const indent = m[1].replace(/\t/g, '    ').length;
    const node = { text: m[2].trim(), children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
  }
  return roots;
}

function outlineToMarkdown(roots, depth = 0) {
  return roots.map((n) => `${'\t'.repeat(depth)}- ${n.text}\n${outlineToMarkdown(n.children, depth + 1)}`).join('');
}

/** Left-to-right tree layout: leaves take consecutive rows, a parent sits in the middle of its children. */
function layoutTree(roots) {
  const nodes = [];
  let row = 0;
  const place = (node, depth, parent) => {
    const item = { node, depth, parent, row: 0 };
    nodes.push(item);
    if (!node.children.length) item.row = row++;
    else {
      const kids = node.children.map((c) => place(c, depth + 1, item));
      item.row = (kids[0].row + kids[kids.length - 1].row) / 2;
    }
    return item;
  };
  roots.forEach((r) => place(r, 0, null));
  return { nodes, rows: row, depth: Math.max(0, ...nodes.map((n) => n.depth)) + 1 };
}

/** The review questions as a tree, to see where each answer leads. */
function reviewTree(steps, title) {
  const build = (id, seen) => {
    const step = steps.find((x) => x.id === id);
    if (!step) return [];
    const node = { text: step.question, children: [] };
    if (seen.includes(id)) return [node];
    if (step.options) node.children = step.options.map((o) => ({ text: o.label, children: o.next ? build(o.next, [...seen, id]) : [] }));
    else if (step.next) node.children = build(step.next, [...seen, id]);
    return [node];
  };
  return [{ text: title, children: build(steps[0].id, []) }];
}

/** Your own review questions, from a tree in the Logic folder (the reverse of reviewTree): the top box is the
 *  tree's name, the box under it the first question. Under a question are its answers; under an answer, the
 *  question it leads to (none: the review moves on to tags). A question with no answers under it is written out;
 *  one whose only branch is another question (ending in "?") is written out and then leads to that question.
 *  Returns the steps ReviewModal walks, or null when the tree has no question. */
function stepsFromTree(roots) {
  const top = roots && roots[0];
  const first = top && top.children[0];
  if (!first) return null;
  const steps = [];
  let n = 0;
  const ask = (node) => {
    const step = { id: `own-${n++}`, question: node.text };
    steps.push(step);
    const kids = node.children;
    if (kids.length === 1 && /\?\s*$/.test(kids[0].text)) step.next = ask(kids[0]);
    else if (kids.length) step.options = kids.slice(0, 9).map((a) => ({ label: a.text, next: a.children[0] ? ask(a.children[0]) : undefined }));
    return step.id;
  };
  ask(first);
  return steps;
}
/** The notes in the Logic folder that, when they exist, replace the built-in review questions. */
const OWN_REVIEW_TREES = { loss: 'Losing trade review', win: 'Winning trade review' };

const LOGIC_TEMPLATE = `- Trade idea
\t- Is it in today's plan?
\t\t- Yes
\t\t\t- Is the entry signal complete?
\t\t\t\t- Yes → enter, stop where planned
\t\t\t\t- No → wait
\t\t- No
\t\t\t- Skip it and write down why it tempted you
`;

