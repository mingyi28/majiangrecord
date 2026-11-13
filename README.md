# 麻将记分

手机上给一桌麻将记分。开一桌拿到房间号，每个人输入名字、选头像坐下。自摸、点炮、手动和流局都记在后台，几台手机看的是同一张账。

```bash
npm install
npm test
npm start
```

没有 `DATABASE_URL` 时，分数写在本机 `data/store.json`。配置 Postgres 后，启动时会执行 `migrations/`。
