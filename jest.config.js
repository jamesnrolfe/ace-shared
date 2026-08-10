module.exports = {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/forms"],
  // Jest's default testMatch treats *every* file under __tests__/ as a suite,
  // so formDriver.ts and formFactory.ts fail as "must contain at least one test".
  testMatch: ["**/*.test.ts?(x)"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
};
