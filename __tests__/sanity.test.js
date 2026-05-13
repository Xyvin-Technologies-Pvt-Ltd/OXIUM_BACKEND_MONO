const { escapeRegex } = require("../src/utils/escapeRegex");
const { parsePagination } = require("../src/utils/parsePagination");

test("escapeRegex escapes dots", () => {
  expect(escapeRegex("a.b")).toBe("a\\.b");
});

test("parsePagination defaults", () => {
  const q = {};
  expect(parsePagination(q)).toMatchObject({ pageNo: 1, skip: 0 });
});
