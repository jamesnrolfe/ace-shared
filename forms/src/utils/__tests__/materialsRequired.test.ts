import { field, showIf, yesNo } from "../../engine/__tests__/formFactory";
import type { MaterialsValue } from "../../types/form/MaterialsInterface";
import { answerIsRequired } from "../form";

/** A required materials question: glass, whose rating only shows when fire rated. */
const materials = field("MATERIALS", {
  question_id: "materials",
  required: true,
  options: [
    {
      key: "glass",
      display: "Glass",
      attributes: [
        { key: "fire_rated", display: "Fire rated", question_type: "SWITCH", options: yesNo },
        {
          key: "rating",
          display: "Rating",
          question_type: "TEXT",
          show_if: showIf([
            { question_id: "fire_rated", operator: "eq", value: "yes" },
          ]),
        },
      ],
    },
  ],
});

const glass = (attributes: Record<string, string | null>): MaterialsValue => [
  { selected_material: "glass", attributes },
];

describe("answerIsRequired for MATERIALS", () => {
  it("passes when a hidden attribute is left empty", () => {
    expect(
      answerIsRequired(true, materials, glass({ fire_rated: "no", rating: null })),
    ).toBeNull();
  });

  it("fails when a shown attribute is left empty", () => {
    expect(
      answerIsRequired(true, materials, glass({ fire_rated: "yes", rating: null })),
    ).toMatchObject({ code: "REQUIRED" });
  });

  it("passes when every shown attribute is filled in", () => {
    expect(
      answerIsRequired(true, materials, glass({ fire_rated: "yes", rating: "EW30" })),
    ).toBeNull();
  });
});
