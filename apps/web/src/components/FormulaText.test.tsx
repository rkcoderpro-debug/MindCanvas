import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FormulaText, { splitFormulaText } from "./FormulaText";

describe("quiz formula text", () => {
  it("keeps older plain text and escaped delimiters unchanged", () => {
    expect(splitFormulaText("Giá \\$5, đáp án 42")).toEqual([{ kind: "text", value: "Giá \\$5, đáp án 42" }]);
    expect(renderToStaticMarkup(<FormulaText text="A < B & C"/>)).toContain("A &lt; B &amp; C");
  });

  it("renders inline math, display math and chemistry in mixed text", () => {
    const result = renderToStaticMarkup(<FormulaText text={"Tính $x^2$; $$\\frac{1}{2}$$; $\\ce{H2O}$"}/>);
    expect(result).toContain("formula-display");
    expect(result).toContain("katex-html");
    expect(result).toContain("mfrac");
    expect(result).toContain("H");
  });

  it("shows an invalid formula as literal source and never renders user HTML", () => {
    const result = renderToStaticMarkup(<FormulaText text={"<img src=x onerror=alert(1)> $\\notARealCommand{a}$"}/>);
    expect(result).not.toContain("<img");
    expect(result).toContain("formula-invalid");
    expect(result).toContain("\\notARealCommand");
  });

  it("accepts TeX bracket delimiters without changing incomplete formulas", () => {
    const parts = splitFormulaText("\\(a+b\\) and \\[c+d\\] then $unfinished");
    expect(parts.filter(part => part.kind === "math")).toHaveLength(2);
    expect(parts.at(-1)?.value).toBe(" then $unfinished");
  });
});
