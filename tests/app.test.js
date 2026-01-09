const app = require("../index");

describe("Basic backend sanity check", () => {
  test("app should be defined", () => {
    expect(app).toBeDefined();
  });
});
