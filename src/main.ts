// Copyright (c) 2026 YA-androidapp(https://github.com/yzkn) All rights reserved.


import * as monaco from 'monaco-editor';

// ?worker&inline を付けることで、別ファイルではなくJSの中に含める
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker&inline';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker&inline';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker&inline';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline';

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { Peer } from 'peerjs';
import type { DataConnection } from 'peerjs';

// --- 1. 初期設定と状態管理 ---
const doc = new Y.Doc();
const type = doc.getText('monaco');
const statusEl = document.getElementById('status')!;
let connections: DataConnection[] = [];

// --- 2. Monaco Editor の初期化 ---
const editor = monaco.editor.create(document.getElementById('editor')!, {
  value: '',
  language: 'plaintext',
  theme: 'vs-dark',
  automaticLayout: true,
});

// YjsとMonacoをバインド
const model = editor.getModel();
if (model) {
  // 以前の binding よりも新しい書き方：
  new MonacoBinding(type, model, new Set([editor]), undefined);
}

// --- 3. PeerJS による P2P 通信 ---

// URLのハッシュをルームIDとする。なければ新規作成。
const roomId = window.location.hash.substring(1);
const isHost = !roomId;
const peer = new Peer(
  // {
  //   debug: 3, // 詳細ログ
  //   config: {
  //     iceServers: [
  //       { urls: 'stun:stun.l.google.com:19302' },
  //       { urls: 'stun:stun1.l.google.com:19302' },
  //       { urls: 'stun:stun2.l.google.com:19302' },
  //       { urls: 'stun:stun3.l.google.com:19302' },
  //       { urls: 'stun:stun4.l.google.com:19302' },
  //     ],
  //     // Firefoxで有効な設定
  //     iceCandidatePoolSize: 10,
  //   }
  // }
); // ランダムなIDで自分を初期化

peer.on('open', (myId: string) => {
  if (isHost) {
    // ホストの場合：自分のIDをハッシュにセット
    window.location.hash = myId;
    statusEl.innerText = `ホストとして待機中... ID: ${myId}`;
  } else {
    // ゲストの場合：URLのID（roomId）に接続
    statusEl.innerText = `接続中: ${roomId}...`;
    const conn = peer.connect(roomId);
    setupConnection(conn);
  }
});

// 他人から接続された時の処理（主にホスト側）
peer.on('connection', (conn: DataConnection) => {
  setupConnection(conn);
  statusEl.innerText = `接続済み: ${connections.length + 1} 人`;
});

function setupConnection(conn: DataConnection) {
  console.log("接続試行中: ", conn.peer);

  conn.on('open', () => {
    console.log("接続が確立しました！");
    connections.push(conn);

    // UIを「接続済み」に更新（ゲスト側でも実行される）
    statusEl.innerText = `接続済み: 他 ${connections.length} 人と同期中`;

    // データの送受信ロジック...
    const state = Y.encodeStateAsUpdate(doc);
    conn.send(state);

    conn.on('data', (data: any) => {
      console.log("received data", data);

      // ArrayBuffer か Uint8Array かに関わらず、正しく Uint8Array に変換する
      const update = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);

      // origin を conn にすることで、この更新を同じ人へ送り返すループを防ぐ
      Y.applyUpdate(doc, update, conn);
    });
  });

  conn.on('error', (err) => {
    console.error("接続エラー:", err);
    statusEl.innerText = "接続エラーが発生しました";
  });

  conn.on('close', () => {
    connections = connections.filter(c => c !== conn);
    statusEl.innerText = connections.length > 0 ? `接続済み: 他 ${connections.length} 人` : "待機中...";
  });
}

// Yjsの変更を全接続先にブロードキャスト
doc.on('update', (update: Uint8Array, origin: any) => {
  console.log("sending update", update)

  // origin が conn (通信相手) からのものでない場合のみ、他の全員に送る
  // つまり、自分のローカル入力や、ファイルからの読み込み内容を送信する
  connections.forEach(conn => {
    if (conn.open && origin !== conn) {
      conn.send(update);
    }
  });
});

// --- 4. 保存・読込・便利機能 ---

// LocalStorage への自動保存
const savedData = localStorage.getItem('p2p-editor-content');
if (savedData && isHost) {
  type.insert(0, savedData);
}

editor.onDidChangeModelContent(() => {
  localStorage.setItem('p2p-editor-content', editor.getValue());
});

// ファイルダウンロード
document.getElementById('downloadBtn')!.onclick = () => {
  const blob = new Blob([editor.getValue()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shared-code.txt';
  a.click();
};

// ファイルアップロード
const uploadInput = document.getElementById('uploadInput') as HTMLInputElement;
document.getElementById('uploadBtn')!.onclick = () => uploadInput.click();
uploadInput.onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const text = await file.text();
    // Yjs経由で内容を置き換え（全員に同期される）
    doc.transact(() => {
      type.delete(0, type.length);
      type.insert(0, text);
    });
  }
};

// URLコピー
document.getElementById('copyUrlBtn')!.onclick = () => {
  navigator.clipboard.writeText(window.location.href);
  alert('共有URLをコピーしました！');
};