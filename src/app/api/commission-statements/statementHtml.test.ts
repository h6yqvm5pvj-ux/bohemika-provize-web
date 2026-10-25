import { describe, expect, it } from "vitest";
import { readStatementHtml, statementLinkHref, statementSectionHtml, statementSummaryHtml, statementTableCells, statementTableRows, StatementHtmlError } from "./statementHtml";

describe("bounded statement table extraction", () => {
  it("preserves mixed-case rows, header cells and ordinary attributes", () => {
    const html = '<TABLE><TR class="first"><TH>Header</TH><td data-key="1">Value</td></TR><tr><td>Next</td></tr></TABLE>';
    const rows = statementTableRows(html);
    expect(rows).toHaveLength(2);
    expect(statementTableCells(rows[0])).toEqual(['<TH>Header</TH>', '<td data-key="1">Value</td>']);
    expect(statementTableCells(rows[1])).toEqual(["<td>Next</td>"]);
  });

  it("allows an incomplete internally sliced summary without rescanning its unmatched suffix", () => {
    const fragment = "<tr><td>Total</td></tr><tr><td>";
    expect(statementTableRows(fragment, true)).toEqual(["<tr><td>Total</td></tr>"]);
    expect(() => statementTableRows(fragment)).toThrow(StatementHtmlError);
  });

  it("rejects excessive cells, long attributes and nested incomplete tags", () => {
    expect(() => statementTableCells("<tr>" + "<td>x</td>".repeat(65) + "</tr>")).toThrow(StatementHtmlError);
    expect(() => readStatementHtml(`<div title="${"x".repeat(8192)}"></div>`)).toThrow(StatementHtmlError);
    expect(() => readStatementHtml("<div ".repeat(500) + ">")).toThrow(StatementHtmlError);
  });

  it("does not truncate stored HTML into a different accepted document", () => {
    expect(() => readStatementHtml(" ".repeat(850001))).toThrow(StatementHtmlError);
    expect(readStatementHtml("  <div>Complete</div>  ")).toBe("<div>Complete</div>");
    expect(readStatementHtml(null)).toBeNull();
  });

  it("accepts an inline statement logo larger than 4 KiB within the bounded document", () => {
    const html = `<img alt="Logo" src="data:image/png;base64,${"A".repeat(5200)}"><div id="provize"><tr><td>Row</td></tr></div>`;
    expect(readStatementHtml(html)).toBe(html);
    expect(statementTableRows(statementSectionHtml(html, "provize"))).toEqual(["<tr><td>Row</td></tr>"]);
  });

  it("preserves quoted angle brackets, comments and raw script/style text without treating them as table elements", () => {
    const prefix = `<script>for(let i=0;i<rows.length;i++){console.log('<tr><td>ignored');}</script>
      <style>.row::before { content: '<div'; }</style><!-- <tr><td>comment -->`;
    const row = '<tr title="1 < 2 > 0"><td>Value</td></tr>';
    const html = `${prefix}<DIV title="id='wrong' > <" ID = 'provize'>${row}</DIV>`;
    expect(readStatementHtml(html)).toBe(html);
    expect(statementTableRows(html)).toEqual([row]);
    expect(statementSectionHtml(html, "provize")).toBe(html.slice(prefix.length));
    expect(statementSectionHtml(html, "wrong")).toBe("");
  });

  it("ends sections and summaries at complete tag boundaries", () => {
    const summary = '<table><tr><td>Celkem</td><td>100</td></tr></table>';
    const reserve = '<div id="zadrzny_fond">Reserve</div>';
    expect(statementSummaryHtml(summary + reserve)).toBe(summary);
    const section = '<div id="provize"><tr><td>Value</td></tr></div>';
    const toggle = '<div title="<" class="vypis_sekce_toggle">Next</div>';
    expect(statementSectionHtml(section + toggle, "provize")).toBe(section);
  });

  it("reads real quoted and unquoted links without rescanning fake anchors in raw script text", () => {
    const prefix = `<script>${"<a ".repeat(100_000)}</script>`;
    for (const anchor of ['<a href="/detail?a=1&amp;b=2">Link</a>', "<a href='/detail?a=1&amp;b=2'>Link</a>", '<a href=/detail?a=1&amp;b=2>Link</a>']) {
      expect(statementLinkHref(prefix + anchor)).toBe("/detail?a=1&amp;b=2");
    }
    expect(statementLinkHref(prefix)).toBeNull();
  });
});
