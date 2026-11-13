const { AppError } = require("./errors");
const { createStore } = require("./store");
const { createApp } = require("../server");

let pending;

function server() {
  if (!pending) {
    pending = createStore()
      .then((store) => createApp(store))
      .catch((error) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

module.exports = async (req, res) => {
  try {
    if (typeof req.body === "string" && req.body) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        req.body = undefined;
      }
    }
    const app = await server();
    app.emit("request", req, res);
  } catch (error) {
    const status = error.status || 500;
    const message = error instanceof AppError ? error.message : "记分没记下，请再试一次";
    const payload = JSON.stringify({ error: message });
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }
};
