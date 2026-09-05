import { describe, expect, it } from "vitest";
import { parseGeneratedDeepDiveQuestions } from "../src/application/deep-dive/deep-dive-question-parser.js";

function question(index: number, optionCount = 3) {
  return {
    options: Array.from({ length: optionCount }, (_, optionIndex) => ({
      description: `Consequence ${optionIndex + 1}`,
      label: `Choice ${index}-${optionIndex + 1}`,
    })),
    prompt: `Question ${index}?`,
    recommendedOptionLabel: `Choice ${index}-2`,
    topic: `Topic ${index}`,
  };
}

describe("deep-dive question parser", () => {
  it("normalizes valid questions and resolves the recommended option by label", () => {
    const [parsed] = parseGeneratedDeepDiveQuestions(JSON.stringify({ questions: [question(1, 5)] }));

    expect(parsed).toEqual(expect.objectContaining({
      answerText: null,
      id: "q-1",
      prompt: "Question 1?",
      recommendedOptionId: "option-2-choice-1-2",
      selectedOptionId: null,
      status: "pending",
      topic: "Topic 1",
    }));
    expect(parsed?.options).toHaveLength(4);
  });

  it("rejects incomplete questions without truncating valid decision coverage", () => {
    const questions = [
      { ...question(0), prompt: "" },
      { ...question(0), options: question(0).options.slice(0, 2) },
      ...Array.from({ length: 10 }, (_, index) => question(index + 1)),
    ];

    const parsed = parseGeneratedDeepDiveQuestions(`prefix ${JSON.stringify({ questions })} suffix`);

    expect(parsed).toHaveLength(10);
    expect(parsed[0]?.id).toBe("q-3");
    expect(parsed.at(-1)?.topic).toBe("Topic 10");
  });

  it("uses the first option when the recommendation is absent or unknown", () => {
    const withoutRecommendation = { ...question(1), recommendedOptionLabel: undefined };
    const unknownRecommendation = { ...question(2), recommendedOptionLabel: "Unavailable" };
    const parsed = parseGeneratedDeepDiveQuestions(JSON.stringify({ questions: [withoutRecommendation, unknownRecommendation] }));

    expect(parsed.map((item) => item.recommendedOptionId)).toEqual([
      "option-1-choice-1-1",
      "option-1-choice-2-1",
    ]);
  });

  it("returns no questions when an object payload cannot be found", () => {
    expect(parseGeneratedDeepDiveQuestions("No structured response was produced.")).toEqual([]);
  });

  it("keeps malformed JSON visible to the caller's fallback boundary", () => {
    expect(() => parseGeneratedDeepDiveQuestions('{"questions": [}')).toThrow();
  });
});
