# 麻将记分

手机上给一桌麻将记分。开一桌拿到 5 位数字房间号，每个人用记住的称呼选个头像坐下。记分时直接给每人填这一局的增减，几台手机看的是同一张账。结束前会先确认。

称呼存在这台手机的本地缓存里，下次进房会自动填上。

```bash
npm install
npm test
npm start
```

没有 `DATABASE_URL` 时，分数写在本机 `data/store.json`。配置 Postgres 后，启动时会执行 `migrations/`。
