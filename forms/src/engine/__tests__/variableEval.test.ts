import { evaluateAllVariables } from "../../utils/eval";
import { createFormDriver } from "./formDriver";
import { field, form, section } from "./formFactory";

const oneText = [section("s", [field("TEXT", { question_id: "count" })])];

describe("variable evaluation", () => {
  it("evalutates an expression against the current answers correctly", async () => {
    const driver = await createFormDriver(
      form(oneText, {
        variables: [{ id: "doubled", eval: "count * 2", default: 0 }],
      }),
    );

    await driver.set("count", 21);
    expect(driver.variables().doubled).toBe(42);
  });

  it("can reference a variable declared before it", async () => {
    const driver = await createFormDriver(
      form(oneText, {
        variables: [
          { id: "first", eval: "1 + 1" },
          { id: "second", eval: "first + 1" },
        ],
      }),
    );

    expect(driver.variables().first).toBe(2);
    expect(driver.variables().second).toBe(3);
  });

  it("converges on a forward reference across evaluation passes", async () => {
    const driver = await createFormDriver(
      form(oneText, {
        variables: [
          { id: "second", eval: "first + 1" },
          { id: "first", eval: "1 + 1" },
        ],
      }),
    );

    // a single pass walks the list top to bottom into one accumulating context
    // so `second` sees an undefined `first` and lands on NaN. The engine's
    // variable effect re-runs whenever the variables change, and so the next
    // pass seeds the context with the previous result, so it settles on 3.
    expect(driver.variables().first).toBe(2);
    expect(driver.variables().second).toBe(3);
  });

  it("resolves only backward references within a single pass", async () => {
    const result = await evaluateAllVariables(
      [
        { id: "second", eval: "first + 1" },
        { id: "first", eval: "1 + 1" },
      ],
      {},
    );

    expect(result.first).toBe(2);
    expect(Number.isNaN(result.second as number)).toBe(true);
  });

  it("falls back to the default when an expression throws", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const driver = await createFormDriver(
      form(oneText, {
        variables: [
          {
            id: "broken",
            eval: "this is not (valid text",
            default: "fallback",
          },
        ],
      }),
    );

    expect(driver.variables().broken).toBe("fallback");
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("keeps a manually set value for a variable that has no eval", async () => {
    const driver = await createFormDriver(
      form(oneText, { variables: [{ id: "mode", default: "auto" }] }),
    );

    await driver.setVariable("mode", "manual");
    // force variable recompute by changing answer
    await driver.set("count", 1);

    expect(driver.variables().mode).toBe("manual");
  });
});
