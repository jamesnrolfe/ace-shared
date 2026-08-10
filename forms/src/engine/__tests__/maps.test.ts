import { createFormDriver } from "./formDriver";
import { field, form, section, showIf, yesNo } from "./formFactory";

const definition = form([
  section("intro", [
    field("SWITCH", { question_id: "gate", options: yesNo }),
    field("TEXT", { question_id: "always_editable" }),
    field("TEXT", { question_id: "locked", editable: false }),
    field("TEXT", {
      question_id: "prefilled_ref",
      default: "SEED-1",
      disable_if: "PREPOPULATED",
    }),
    field("TEXT", { question_id: "blank_ref", disable_if: "PREPOPULATED" }),
  ]),
  section(
    "details",
    [
      field("TEXT", { question_id: "detail_note", required: true }),
      field("TEXT", {
        question_id: "conditional_note",
        required: showIf([
          { question_id: "gate", operator: "eq", value: "yes" },
        ]),
      }),
    ],
    {
      show_if: showIf([{ question_id: "gate", operator: "eq", value: "yes" }]),
    },
  ),
  section(
    "doors",
    [field("TEXT", { question_id: "door_ref", required: true })],
    {
      repeating: true,
    },
  ),
]);

describe("visibilityMap", () => {
  it("is keyed by section ID as well as question ID", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.maps().visibility.intro).toBe(true);
    expect(driver.maps().visibility.details).toBe(false);
    expect(driver.maps().visibility.gate).toBe(true);
  });

  it("gates every field onto its section's visibility", async () => {
    const driver = await createFormDriver(definition);

    // detail_note has no show_if of its own, only the section is gated
    expect(driver.maps().visibility.detail_note).toBe(false);

    await driver.set("gate", "yes");

    expect(driver.maps().visibility.details).toBe(true);
    expect(driver.maps().visibility.detail_note).toBe(true);
  });

  it("keys repeating fields by canonical suffixed ID, one per instance", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.addInstance("doors");

    expect(driver.maps().visibility["doors.door_ref__0"]).toBe(true);
    expect(driver.maps().visibility["doors.door_ref__1"]).toBe(true);
    expect(driver.maps().visibility["doors.door_ref__2"]).toBeUndefined();
    // unsuffixed ID is never a visibility key for a repeating field
    expect(driver.maps().visibility.door_ref).toBeUndefined();
  });
});

describe("requiredMap", () => {
  it("carries static required flags straight through", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.maps().required.detail_note).toBe(true);
    expect(driver.maps().required.always_editable).toBe(false);
  });

  it("evaluates rule-based required against current answers", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.maps().required.conditional_note).toBe(false);

    await driver.set("gate", "yes");

    expect(driver.maps().required.conditional_note).toBe(true);
  });

  it("omits repeating fields entirely, leaving it to isFieldRequired", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");

    // useFormMaps skips repeating sections
    expect(driver.maps().required["doors.door_ref__0"]).toBeUndefined();
    expect(driver.maps().required.door_ref).toBeUndefined();
    // ...so action layer falls back to field definition instead using required
    expect(driver.required("doors.door_ref__0")).toBe(true);
  });

  it("reports required independently of visibility", async () => {
    const driver = await createFormDriver(definition);

    // detail_note sits in a hidden section but still reads as required
    expect(driver.maps().visibility.detail_note).toBe(false);
    expect(driver.maps().required.detail_note).toBe(true);
  });
});

describe("editableMap", () => {
  it("only contains keys for fields using disable_if PREPOPULATED", async () => {
    const driver = await createFormDriver(definition);

    expect(Object.keys(driver.maps().editable).sort()).toEqual([
      "blank_ref",
      "prefilled_ref",
    ]);
  });

  it("locks a PREPOPULATED field once it has an initial value", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.maps().editable.prefilled_ref).toBe(false);
    expect(driver.maps().editable.blank_ref).toBe(true);
  });

  it("falls back to the field definition for everything else", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.editable("always_editable")).toBe(true);
    expect(driver.editable("locked")).toBe(false);
  });

  it("forces every field non-editable in readonly mode", async () => {
    const driver = await createFormDriver(definition, { readOnly: true });

    expect(driver.editable("always_editable")).toBe(false);
    expect(driver.editable("prefilled_ref")).toBe(false);
    // raw map still computed
    expect(driver.maps().editable.blank_ref).toBe(true);
    expect(driver.maps().editable.prefilled_ref).toBe(false);
  });
});
