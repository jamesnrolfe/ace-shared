import { createFormDriver } from "./formDriver";
import { field, form, section, showIf, yesNo } from "./formFactory";

const definition = form([
  section("about_visit", [
    field("SWITCH", {
      question_id: "able_to_access",
      options: yesNo,
      required: true,
    }),
    field("SELECT", {
      question_id: "no_access_reason",
      options: [
        { key: "locked", display: "Building locked" },
        { key: "resident", display: "Resident refused" },
      ],
      required: true,
      show_if: showIf([
        { question_id: "able_to_access", operator: "eq", value: "no" },
      ]),
    }),
  ]),
]);

describe("was shown / was_shown_on_submit", () => {
  it("starts hidden and unshown on a blank form", async () => {
    const driver = await createFormDriver(definition);

    expect(driver.visible("no_access_reason")).toBe(false);
    expect(driver.answers().no_access_reason.was_shown).toBe(false);
    expect(driver.submission().no_access_reason.was_shown_on_submit).toBe(
      false,
    );
  });

  it("marks was_shown once the gate opens", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("able_to_access", "no");

    // once condition met, should be visible
    expect(driver.visible("no_access_reason")).toBe(true);
    // was_shown also updated...
    expect(driver.answers().no_access_reason.was_shown).toBe(true);
    // on submit, was_shown_on_submit is set to true
    expect(driver.submission().no_access_reason.was_shown_on_submit).toBe(true);
  });

  it("keeps the answer but clears was_shown_on_submit when re-hidden", async () => {
    const driver = await createFormDriver(definition);

    await driver.set("able_to_access", "no");
    await driver.set("no_access_reason", "locked");
    await driver.set("able_to_access", "yes");

    const submitted = driver.submission().no_access_reason;

    // field no longer on screen, must not count as shown when submitted
    expect(submitted.was_shown_on_submit).toBe(false);
    // but was_shown exists if the field was visible AT ANY POINT
    expect(submitted.was_shown).toBe(true);
    // value survives, flag is what tells the backend to ignore
    expect(submitted.value_current).toBe("locked");
  });

  it("does not block submission on a hidden required field", async () => {
    const driver = await createFormDriver(definition);

    // set able_to_access to be yes - do not show the next question
    await driver.set("able_to_access", "yes");

    // expect the question to not be shown as required (it is hidden)
    // actually correction - this required does not care if the field is hidden
    // or not - the guard is actually in validateAll()
    // expect(driver.required("no_access_reason")).toBe(false);

    // full validations should pass
    expect(await driver.validateAll()).toBe(true);
    // no errors should appear (will be true if above is, but worth checking)
    expect(driver.errors()).toEqual({});
  });
});
