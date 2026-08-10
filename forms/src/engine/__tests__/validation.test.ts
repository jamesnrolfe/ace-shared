import { createFormDriver } from "./formDriver";
import { field, form, section, showIf, yesNo } from "./formFactory";

const definition = form([
  section("s", [
    field("SWITCH", { question_id: "gate", options: yesNo }),
    field("TEXT", { question_id: "always_required", required: true }),
    field("TEXT", {
      question_id: "conditional_required",
      required: true,
      show_if: showIf([{ question_id: "gate", operator: "eq", value: "yes" }]),
    }),
  ]),
]);

/** A form whose top-level validations cap two numeric answers. */
const cappedForm = form(
  [
    section("s", [
      field("INTEGER", { question_id: "count" }),
      field("SWITCH", { question_id: "gate", options: yesNo }),
      field("INTEGER", {
        question_id: "hidden_count",
        show_if: showIf([
          { question_id: "gate", operator: "eq", value: "yes" },
        ]),
      }),
    ]),
  ],
  {
    validations: [
      {
        require: "all",
        conditions: [{ question_id: "count", operator: "lte", value: 10 }],
        message: "Count must be 10 or fewer.",
        shown_on: ["count"],
      },
      {
        require: "all",
        conditions: [
          { question_id: "hidden_count", operator: "lte", value: 5 },
        ],
        message: "Hidden count must be 5 or fewer.",
        shown_on: ["hidden_count"],
      },
    ],
  },
);

describe("validation", () => {
  it("fails on an empty visible required field and records the error", async () => {
    const driver = await createFormDriver(definition);

    expect(await driver.validateAll()).toBe(false);
    // NOTE: this test will fail if you ever change the message / code
    // ensure that you are aware of that little hiccup
    expect(driver.errors().always_required).toEqual({
      code: "REQUIRED",
      message: "This field is required.",
    });
  });

  it("passes once every visible required field is answered", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("always_required", "done");

    expect(await driver.validateAll()).toBe(true);
    expect(driver.errors()).toEqual({});
  });

  it("ignores required fields that are not visible", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("always_required", "done");
    // condition_required is required but hidden, so should not block
    expect(await driver.validateAll()).toBe(true);

    await driver.set("gate", "yes");
    expect(await driver.validateAll()).toBe(false);
    expect(driver.errors().conditional_required).toBeDefined();
  });

  it("suppresses a required field marked unavailable", async () => {
    const driver = await createFormDriver(definition);

    driver.markUnavailable("always_required");

    expect(driver.required("always_required")).toBe(false);
    expect(driver.visible("always_required")).toBe(false);
    expect(await driver.validateAll()).toBe(true);
  });

  it("clears stale errors on each validateAll run", async () => {
    const driver = await createFormDriver(definition);

    expect(await driver.validateAll()).toBe(false);
    expect(driver.errors().always_required).toBeDefined();

    await driver.set("always_required", "done");

    expect(await driver.validateAll()).toBe(true);
    expect(driver.errors().always_required).toBeUndefined();
  });

  it("reports a failing top-level validation against its shown_on field", async () => {
    const driver = await createFormDriver(cappedForm);

    await driver.set("count", 20);

    expect(await driver.validateAll()).toBe(false);
    expect(driver.errors().count).toEqual({
      code: "VALIDATION_RULE",
      message: "Count must be 10 or fewer.",
    });
  });

  it("skips a validation rule whose referenced field is hidden", async () => {
    const driver = await createFormDriver(cappedForm);

    await driver.set("count", 5);
    // hidden_count is out of range, but the first is not visible, so the rule
    // is skipped rather than failing the form
    await driver.set("hidden_count", 99);

    expect(driver.visible("hidden_count")).toBe(false);
    expect(await driver.validateAll()).toBe(true);
    expect(driver.errors()).toEqual({});
  });
});
