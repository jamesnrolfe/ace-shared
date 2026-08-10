import { createFormDriver } from "./formDriver";
import { field, form, section, showIf, yesNo } from "./formFactory";

const gate = field("SWITCH", { question_id: "gate", options: yesNo });

const withOptions = (
  options: {
    key: string;
    display: string;
    show_if?: ReturnType<typeof showIf>;
  }[],
  prefill = true,
) =>
  form([
    section("s", [
      gate,
      field("SELECT", {
        question_id: "picked",
        prefill,
        options,
        show_if: showIf([
          { question_id: "gate", operator: "eq", value: "yes" },
        ]),
      }),
    ]),
  ]);

describe("hidden prefill", () => {
  it("fills a hidden blank field when only one option is showable", async () => {
    const driver = await createFormDriver(
      withOptions([{ key: "only", display: "Only" }]),
    );

    expect(driver.visible("picked")).toBe(false);
    // live answer statys blank - prefill happens at submit time
    expect(driver.answers().picked.value_current).toBeNull();
    expect(driver.submission().picked.value_current).toBe("only");
    // both was_shown and was_shown_on_submit should be false (field was never
    // shown to the user)
    expect(driver.submission().picked.was_shown).toBe(false);
    expect(driver.submission().picked.was_shown_on_submit).toBe(false);
  });

  it("sets was_prefilled to true when prefilling", async () => {
    const driver = await createFormDriver(
      withOptions([{ key: "only", display: "Only" }]),
    );

    // on submission, we want was_prefilled = true
    expect(driver.submission().picked.was_prefilled).toBe(true);
  });

  it("sets value_initial to the prefilled value", async () => {
    const driver = await createFormDriver(
      withOptions([{ key: "only", display: "Only" }]),
    );

    // on prefill, we expect the value_initial to be set to whatever was
    // prefilled
    expect(driver.submission().picked.value_initial).toEqual("only");
  });

  it("does not fill when more than one option is showable and does not set was_prefilled = true", async () => {
    const driver = await createFormDriver(
      withOptions([
        { key: "first", display: "First" },
        { key: "second", display: "Second" },
      ]),
    );

    const submission = driver.submission();
    expect(submission.picked.value_current).toBeNull();
    // dont want was_prefilled in this case
    expect(submission.picked.was_prefilled).toBe(false);
  });

  it("counts only options whose own show_if passes", async () => {
    const driver = await createFormDriver(
      withOptions([
        { key: "only_visible", display: "Only visible option" },
        {
          key: "hidden_option",
          display: "Hidden option",
          show_if: showIf([
            { question_id: "gate", operator: "eq", value: "can never be this" },
          ]),
        },
      ]),
    );

    expect(driver.submission().picked.value_current).toBe("only_visible");
  });

  it("does nothing without prefill on the field", async () => {
    const driver = await createFormDriver(
      withOptions([{ key: "only", display: "Only" }], false),
    );

    expect(driver.submission().picked.value_current).toBeNull();
  });

  it("leaves a visible blank field alone", async () => {
    const driver = await createFormDriver(
      withOptions([{ key: "only", display: "Only" }]),
    );

    await driver.set("gate", "yes");

    expect(driver.visible("picked")).toBe(true);
    expect(driver.submission().picked.value_current).toBeNull();
  });

  it("never overwrites a value the user already chose", async () => {
    const driver = await createFormDriver(
      withOptions([
        { key: "only", display: "Only" },
        { key: "second", display: "Second" },
      ]),
    );

    await driver.set("gate", "yes");
    await driver.set("picked", "second");
    await driver.set("gate", "no");

    expect(driver.submission().picked.value_current).toBe("second");
  });

  // select fields should be `value`, multiselect should be `[value, ...]`
  it("wraps the value in an array for MULTISELECT", async () => {
    const driver = await createFormDriver(
      form([
        section("s", [
          gate,
          field("MULTISELECT", {
            question_id: "picked_many",
            prefill: true,
            options: [{ key: "only", display: "Only" }],
            show_if: showIf([
              { question_id: "gate", operator: "eq", value: "yes" },
            ]),
          }),
        ]),
      ]),
    );

    expect(driver.submission().picked_many.value_current).toEqual(["only"]);
  });
});
