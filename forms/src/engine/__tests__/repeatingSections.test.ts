import { createFormDriver } from "./formDriver";
import { field, form, section, showIf, yesNo } from "./formFactory";

const key = (questionId: string, instance: number) =>
  `doors.${questionId}__${instance}`;

const definition = form([
  section(
    "doors",
    [
      field("TEXT", { question_id: "door_ref" }),
      field("SWITCH", { question_id: "damaged", options: yesNo }),
      field("TEXT", {
        question_id: "damage_notes",
        show_if: showIf([
          { question_id: "damaged", operator: "eq", value: "yes" },
        ]),
      }),
    ],
    { repeating: true, repeat_name: "Door" },
  ),
]);

describe("repeating sections", () => {
  it("starts with no instances", async () => {
    const driver = await createFormDriver(definition);

    expect(Object.keys(driver.answers())).toEqual([]);
  });

  it("appends a blank instance per addInstance call", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.addInstance("doors");

    expect(driver.answers()[key("door_ref", 0)]).toBeDefined();
    expect(driver.answers()[key("door_ref", 1)]).toBeDefined();
    expect(driver.answers()[key("door_ref", 1)].value_current).toBeNull();
    expect(driver.answers()[key("door_ref", 2)]).toBeUndefined();
  });

  it("keeps instances independent", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.addInstance("doors");
    await driver.set(key("door_ref", 0), "D-100");
    await driver.set(key("door_ref", 1), "D-200");

    expect(driver.answers()[key("door_ref", 0)].value_current).toBe("D-100");
    expect(driver.answers()[key("door_ref", 1)].value_current).toBe("D-200");
  });

  it("resolves show_if per instance", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.addInstance("doors");
    await driver.set(key("damaged", 0), "yes");

    expect(driver.visible(key("damage_notes", 0))).toBe(true);
    expect(driver.visible(key("damage_notes", 1))).toBe(false);
  });

  it("shifts later instances down when one is deleted", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.addInstance("doors");
    await driver.addInstance("doors");

    await driver.set(key("door_ref", 0), "first");
    await driver.set(key("door_ref", 1), "middle");
    await driver.set(key("door_ref", 2), "last");

    await driver.deleteInstance("doors", 1);

    expect(driver.answers()[key("door_ref", 0)].value_current).toBe("first");
    expect(driver.answers()[key("door_ref", 1)].value_current).toBe("last");

    // no orphaned index left behind at the old tail
    expect(driver.answers()[key("door_ref", 2)]).toBeUndefined();
  });

  it("marks was_shown per instance as fields become visible", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.addInstance("doors");

    // damage_notes is gated per instance, so only instance 0 has been seen
    await driver.set(key("damaged", 0), "yes");

    expect(driver.answers()[key("door_ref", 0)].was_shown).toBe(true);
    expect(driver.answers()[key("door_ref", 1)].was_shown).toBe(true);
    expect(driver.answers()[key("damage_notes", 0)].was_shown).toBe(true);
    expect(driver.answers()[key("damage_notes", 1)].was_shown).toBe(false);
  });

  it("keeps was_shown = true once an instance field has been seen", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");
    await driver.set(key("damaged", 0), "yes");
    await driver.set(key("damage_notes", 0), "scuffed");
    await driver.set(key("damaged", 0), "no");

    const submitted = driver.submission();
    expect(submitted[key("damage_notes", 0)].was_shown).toBe(true);
    expect(submitted[key("damage_notes", 0)].was_shown_on_submit).toBe(false);
    expect(submitted[key("damage_notes", 0)].value_current).toBe("scuffed");
  });

  it("does not mark was_shown for an instance that was never added", async () => {
    const driver = await createFormDriver(definition);

    await driver.addInstance("doors");

    expect(driver.answers()[key("door_ref", 1)]).toBeUndefined();
  });
});
