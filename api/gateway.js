const handler = require("../lib/vercel-handler");

module.exports = (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.searchParams.get("__api_path");

  if (path) {
    url.searchParams.delete("__api_path");
    const query = url.searchParams.toString();
    req.url = `/api/${path}${query ? `?${query}` : ""}`;
  }

  return handler(req, res);
};
