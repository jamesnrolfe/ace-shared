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

/** The same "count over 10" check written in each `error_when` polarity. */
const polarityForm = form(
  [
    section("s", [
      field("INTEGER", { question_id: "asserted" }),
      field("INTEGER", { question_id: "forbidden" }),
      field("QR", {
        question_id: "scan",
        validations: {
          require: "all",
          error_when: "matched",
          conditions: [
            {
              question_id: "this",
              operator: "matches",
              field: "data",
              value: "^bad",
            },
          ],
          message: "Bad scan.",
        },
      }),
    ]),
  ],
  {
    validations: [
      {
        require: "all",
        error_when: "unmatched",
        conditions: [{ question_id: "asserted", operator: "lte", value: 10 }],
        message: "Asserted must be 10 or fewer.",
        shown_on: ["asserted"],
      },
      {
        require: "all",
        error_when: "matched",
        conditions: [{ question_id: "forbidden", operator: "gt", value: 10 }],
        message: "Forbidden must be 10 or fewer.",
        shown_on: ["forbidden"],
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

  describe("error_when", () => {
    it("errors when an unmatched-mode rule is false", async () => {
      const driver = await createFormDriver(polarityForm);

      await driver.set("asserted", 20);
      await driver.set("forbidden", 5);

      expect(await driver.validateAll()).toBe(false);
      expect(driver.errors().asserted?.message).toBe(
        "Asserted must be 10 or fewer.",
      );
      expect(driver.errors().forbidden).toBeUndefined();
    });

    it("errors when a matched-mode rule is true", async () => {
      const driver = await createFormDriver(polarityForm);

      await driver.set("asserted", 5);
      await driver.set("forbidden", 20);

      expect(await driver.validateAll()).toBe(false);
      expect(driver.errors().forbidden?.message).toBe(
        "Forbidden must be 10 or fewer.",
      );
      expect(driver.errors().asserted).toBeUndefined();
    });

    it("passes both modes when values are in range", async () => {
      const driver = await createFormDriver(polarityForm);

      await driver.set("asserted", 5);
      await driver.set("forbidden", 5);

      expect(await driver.validateAll()).toBe(true);
      expect(driver.errors()).toEqual({});
    });

    it("does not raise a matched-mode rule on an empty answer", async () => {
      // an empty QR array never matches a field condition, so a matched-mode
      // rule stays quiet - unlike the equivalent unmatched-mode assertion
      const driver = await createFormDriver(polarityForm);

      await driver.set("asserted", 5);
      await driver.set("forbidden", 5);

      expect(await driver.validateAll()).toBe(true);
      expect(driver.errors().scan).toBeUndefined();
    });

    it("applies matched mode to field-level validations", async () => {
      const driver = await createFormDriver(polarityForm);

      await driver.set("asserted", 5);
      await driver.set("forbidden", 5);
      await driver.set("scan", [
        {
          id: "1",
          uri: "file://x",
          photo_taken_ts: "2026-10-27T00:00:00Z",
          photo_src: "CAMERA",
          data: "bad-code",
          type: "QR_CODE",
        },
      ]);

      expect(await driver.validateAll()).toBe(false);
      expect(driver.errors().scan?.message).toBe("Bad scan.");
    });
  });
});
