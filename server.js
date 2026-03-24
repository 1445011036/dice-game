const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

// ── 昵称生成 ──────────────────────────────────────
const ADJ = [
  '幸运的','勇敢的','神秘的','快乐的','闪耀的','无敌的','淡定的',
  '疯狂的','优雅的','暴躁的','温柔的','孤独的','热血的','冷酷的',
  '可爱的','傲娇的','佛系的','硬核的','摸鱼的','干饭的','躺平的',
  '内卷的','氪金的','欧皇','非酋','天选的','最强的','沉默的'
];
const NOUN = [
  '骰神','赌侠','猛男','萌新','大佬','路人','学霸','咸鱼',
  '狮子','老虎','飞龙','凤凰','麒麟','白泽','玄武','青龙',
  '星星','月亮','太阳','流星','彗星','极光','闪电','烈焰',
  '剑客','法师','刺客','战士','弓手','召唤师','炼金术士'
];

function randomNickname() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const num = Math.floor(Math.random() * 100);
  return `${a}${n}${num}`;
}

// ── 数据存储（内存） ─────────────────────────────────
let records = [];   // 全局掷骰记录
let nextId = 1;

// ── WebSocket ────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.nickname = null;
  ws.isAdmin = false;
  ws.initialized = false;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // 客户端发送初始化请求（带或不带已有昵称）
    if (msg.type === 'hello') {
      if (msg.nickname && msg.nickname.trim()) {
        ws.nickname = msg.nickname.trim();
      } else {
        ws.nickname = randomNickname();
      }
      ws.initialized = true;
      ws.send(JSON.stringify({
        type: 'init',
        nickname: ws.nickname,
        records
      }));
      return;
    }

    if (!ws.initialized) return;

    // 管理员登录
    if (msg.type === 'admin_login') {
      if (msg.username === 'admin' && msg.password === 'nange2060') {
        ws.isAdmin = true;
        ws.send(JSON.stringify({ type: 'admin_login_ok' }));
      } else {
        ws.send(JSON.stringify({ type: 'admin_login_fail' }));
      }
      return;
    }

    // 管理员登出
    if (msg.type === 'admin_logout') {
      ws.isAdmin = false;
      return;
    }

    // 管理员删除整条记录
    if (msg.type === 'admin_delete_record') {
      if (!ws.isAdmin) return;
      records = records.filter(r => r.id !== msg.recordId);
      broadcast({ type: 'record_deleted', recordId: msg.recordId });
      return;
    }

    // 管理员删除某条挑战子记录
    if (msg.type === 'admin_delete_challenge') {
      if (!ws.isAdmin) return;
      const rec = records.find(r => r.id === msg.recordId);
      if (!rec) return;
      rec.challenges.splice(msg.challengeIndex, 1);
      broadcast({ type: 'challenge_deleted', recordId: msg.recordId, challengeIndex: msg.challengeIndex });
      return;
    }

    if (msg.type === 'roll') {
      // 新掷骰记录
      const record = {
        id: nextId++,
        nickname: ws.nickname,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        results: msg.results,
        sum: msg.sum,
        diceCount: msg.results.length,
        challenges: []
      };
      records.unshift(record);
      // 只保留最近 100 条
      if (records.length > 100) records = records.slice(0, 100);

      broadcast({
        type: 'new_record',
        record
      });
    }

    if (msg.type === 'challenge') {
      // 挑战某条记录
      const target = records.find(r => r.id === msg.recordId);
      if (!target) return;

      const challenge = {
        nickname: ws.nickname,
        results: msg.results,
        sum: msg.sum,
        targetSum: target.sum,
        win: msg.sum > target.sum,
        draw: msg.sum === target.sum,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false })
      };
      target.challenges.push(challenge);

      broadcast({
        type: 'challenge_result',
        recordId: msg.recordId,
        challenge
      });
    }
  });

  ws.on('close', () => {});
});

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(json);
  });
}

// ── 启动 ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎲 掷骰子服务已启动: http://localhost:${PORT}`);
});
