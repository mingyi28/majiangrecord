const path = require("path");
const { AppError } = require("./errors");
const { createMemoryStore } = require("./memory-store");
const { createPgStore } = require("./pg-store");

async function createStore() {
  if (process.env.DATABASE_URL) {
    const store = createPgStore(process.env.DATABASE_URL);
    await store.ready();
    return store;
  }
  if (process.env.VERCEL) {
    throw new AppError(503, "线上还没接上数据库。在 Vercel 项目里设置 DATABASE_URL（Postgres）后再开桌。");
  }
  const filePath = path.join(__dirname, "..", "data", "store.json");
  const store = createMemoryStore(filePath);
  await store.ready();
  return store;
}

module.exports = { createStore };
