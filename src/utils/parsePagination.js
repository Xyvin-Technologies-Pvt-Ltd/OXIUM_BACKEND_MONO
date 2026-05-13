function parsePagination(reqQuery, defaults = {}) {
  const pageSize = Math.max(
    1,
    Math.min(
      Number.parseInt(defaults.pageSize ?? reqQuery.pageSize ?? 10, 10) || 10,
      defaults.maxLimit ?? 100
    )
  );
  const rawPage =
    Number.parseInt(defaults.pageNo ?? reqQuery.pageNo ?? "1", 10) || 1;
  const pageNo = Math.max(1, rawPage);
  const skip = (pageNo - 1) * pageSize;
  return { pageNo, pageSize, skip, limit: pageSize };
}

module.exports = { parsePagination };
