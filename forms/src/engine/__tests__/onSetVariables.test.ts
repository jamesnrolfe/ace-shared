import { createFormDriver } from "./formDriver";
import { field, form, section } from "./formFactory";

const definition = form(
  [
    section("s", [
      field("TEXT", {
        question_id: "notes",
        on_set: [{ variable_id: "touched", value: "yes" }],
      }),
      field("MULTISELECT", {
        question_id: "tags",
        options: [
          {
            key: "a",
            display: "A",
            on_set: [{ variable_id: "from_a", value: true }],
          },
          {
            key: "b",
            display: "B",
            on_set: [{ variable_id: "from_b", value: true }],
          },
        ],
      }),
    ]),
  ],
  {
    variables: [
      { id: "touched", default: "no" },
      { id: "from_a", default: false },
      { id: "from_b", default: false },
    ],
  },
);

describe("on_set variables", () => {
  it("starts from the declared defaults", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.variables()).toEqual({
      touched: "no",
      from_a: false,
      from_b: false,
    });
  });

  it("fires field-level on_set whenever the answer is set", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("notes", "anything");

    expect(driver.variables().touched).toBe("yes");
  });

  it("fires option-level on_set only for newly added keys", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("tags", ["a"]);
    expect(driver.variables().from_a).toBe(true);
    expect(driver.variables().from_b).toBe(false);
  });

  it("does NOT revert the variable when the option is deselected", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("tags", ["a"]);
    await driver.set("tags", []);

    // on_set is oneway: it fires only for keys added by this set, so removing
    // a key has no inverse action. This is intentional to keep the implementation
    // a little bit more deterministic, but frankly this is why we moved to the
    // alternative jexl implementation for variables which are re-evaluated
    // globally on any answer change so they keep up to date. This is a legacy
    // feature that is supported for hyper-specific usecases, but honestly
    // its quite a rubbish implementation
    expect(driver.variables().from_a).toBe(true);
  });
});
