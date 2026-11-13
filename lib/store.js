const path = require("path");
const { createMemoryStore } = require("./memory-store");
const { createPgStore } = require("./pg-store");

async function createStore() {
  if (process.env.DATABASE_URL) {
    const store = createPgStore(process.env.DATABASE_URL);
    await store.ready();
    return store;
  }
  const filePath = path.join(__dirname, "..", "data", "store.json");
  const store = createMemoryStore(filePath);
  await store.ready();
  return store;
}

module.exports = { createStore };
