import assert from 'node:assert/strict';
import { parseBlocks, serializeBlocks, parseInline, inlineToHtml, plainText, escInline, extractTags as m_extract } from '../js/md.js';
import { renderTex } from '../js/math.js';

let n = 0; const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const strip = bs => bs.map(({ id, ...b }) => b);
const rt = md => serializeBlocks(parseBlocks(md));

const doc = `# Лекція 5

Вступний абзац з **жирним**, *курсивом*, \`кодом\`, ==виділенням== і $x^2$.
Другий рядок абзацу.

- пункт
  - вкладений
    продовження
- [ ] справа
- [x] зроблено
1. перший
2. другий
+ розгортний

  дитина

> цитата
> друга

> [!warning] Увага
> текст

\`\`\`js
const a = 1;

console.log(a);
\`\`\`

$$
\\int_0^1 x\\,dx
$$

---

![схема](asset:abc.png)

| A | B |
| --- | --- |
| 1 | a\\|b |

&nbsp;

Кінець`;

ok('roundtrip stable', () => { const a = rt(doc); assert.equal(rt(a), a); });
ok('blocks types', () => {
  const b = strip(parseBlocks(doc));
  assert.deepEqual(b.map(x => x.type), ['h1', 'p', 'ul', 'ul', 'todo', 'todo', 'ol', 'ol', 'toggle', 'p', 'quote', 'callout', 'code', 'math', 'hr', 'image', 'table', 'p', 'p']);
  assert.equal(b[1].text, 'Вступний абзац з **жирним**, *курсивом*, `кодом`, ==виділенням== і $x^2$.\nДругий рядок абзацу.');
  assert.equal(b[3].indent, 1); assert.equal(b[3].text, 'вкладений\nпродовження');
  assert.equal(b[5].checked, true); assert.equal(b[9].indent, 1); assert.equal(b[9].text, 'дитина');
  assert.equal(b[11].kind, 'warning'); assert.equal(b[11].text, 'Увага\nтекст');
  assert.equal(b[12].text, 'const a = 1;\n\nconsole.log(a);'); assert.equal(b[12].lang, 'js');
  assert.equal(b[13].text, '\\int_0^1 x\\,dx');
  assert.deepEqual(b[16].rows, [['A', 'B'], ['1', 'a|b']]);
  assert.equal(b[17].text, '');
});
ok('guard', () => {
  const bs = [{ id: 'a', type: 'p', text: '# не заголовок', indent: 0 }, { id: 'b', type: 'p', text: '1. не список', indent: 0 }, { id: 'c', type: 'ul', text: '[ ] не справа', indent: 0 }];
  const s = serializeBlocks(bs);
  assert.deepEqual(strip(parseBlocks(s)).map(b => [b.type, b.text]), [['p', '\\# не заголовок'], ['p', '1\\. не список'], ['ul', '\\[ ] не справа']]);
  // текст з екрануванням при відображенні дає оригінал
  assert.equal(parseInline('\\# не заголовок')[0].v, '# не заголовок');
});
ok('ol numbering', () => {
  const s = serializeBlocks([{ type: 'ol', text: 'a', indent: 0 }, { type: 'ol', text: 'b', indent: 0 }, { type: 'ol', text: 'b1', indent: 1 }, { type: 'ol', text: 'c', indent: 0 }]);
  assert.equal(s, '1. a\n2. b\n  1. b1\n3. c');
});
ok('inline', () => {
  const h = inlineToHtml('**b *i*** [l](https://x.ua) ~~s~~ [[Нота|id1]] www.ex.com.');
  assert.ok(h.includes('<strong>b <em>i</em></strong>'), h);
  assert.ok(h.includes('<a href="https://x.ua"'));
  assert.ok(h.includes('<s>s</s>'));
  assert.ok(h.includes('data-wiki="id1"'));
  assert.ok(h.includes('href="https://www.ex.com"'));
  assert.ok(!inlineToHtml('ціна $5 і $6').includes('class="im"'));
  assert.ok(inlineToHtml('a\\*b').includes('a*b'));
  assert.equal(escInline('2*3 = [x] $'), '2\\*3 = \\[x\\] \\$');
});
ok('plain', () => { assert.equal(plainText('# Т\n\n- **а** б'), 'Т а б'); });
ok('math', () => {
  const m = renderTex('\\frac{a}{b}+\\sqrt[3]{x^2}-\\sum_{i=1}^{n} i', true);
  assert.ok(m.includes('<mfrac><mi>a</mi><mi>b</mi></mfrac>'), m);
  assert.ok(m.includes('<mroot>'));
  assert.ok(m.includes('<munderover><mo largeop="true" movablelimits="true">∑</mo>'), m);
  assert.ok(renderTex('\\mathbb{R}').includes('ℝ'));
  assert.ok(renderTex('\\text{якщо } x').includes('<mtext>якщо </mtext>'), renderTex('\\text{якщо } x'));
  const mat = renderTex('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
  assert.ok(mat.includes('<mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr>'), mat);
  assert.ok(renderTex('\\left( \\frac{1}{2} \\right)').includes('stretchy="true">('));
  assert.ok(renderTex('f\'(x)').includes('′'));
  assert.ok(renderTex('\\lim_{x \\to 0} \\frac{\\sin x}{x}', true).includes('<munder><mi>lim</mi>'), renderTex('\\lim_{x \\to 0} \\frac{\\sin x}{x}', true));
  assert.ok(renderTex('\\foo').includes('merror'));
  assert.ok(renderTex('\\begin{cases} x & x>0 \\\\ -x & \\text{інакше} \\end{cases}').includes('<mtext>інакше</mtext>'));
});
ok('tags', () => {
  const { extractTags } = { extractTags: m_extract };
  assert.deepEqual(extractTags('Т #Ідея', 'текст #ідея і #лаби/2\n\n```\n#код\n```\n\n# Заголовок\n\nзадача #3').map(x => x.key), ['ідея', 'лаби/2']);
  assert.ok(inlineToHtml('a #тег').includes('class="htag"'));
  assert.equal(serializeBlocks(parseBlocks('#тег на початку рядка')), '#тег на початку рядка');
});
console.log('md ok:', n);
