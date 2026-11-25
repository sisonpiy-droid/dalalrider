import Peer, { DataConnection } from 'peerjs';
import { getPlayerId, getNickname } from './data/TickerData';

export interface RoomPlayer {
  id: string;
  nickname: string;
  color: string;
  isHost: boolean;
  ready: boolean;
  x: number;
  y: number;
  angle: number;
  progress: number;
  score: number;
  crashes: number;
  finished: boolean;
  finishTime: number;
  finishRank: number;
  lastUpdate: number;
}

export interface RoomState {
  code: string;
  hostId: string;
  ticker: string;
  period: string;
  smooth: boolean;
  status: 'lobby' | 'countdown' | 'racing' | 'finished';
  startTime: number;
  winnerId: string | null;
  winnerName: string | null;
  winnerTime: number | null;
  players: Record<string, RoomPlayer>;
}

type RoomListener = (state: RoomState) => void;

const PLAYER_COLORS = [
  '#FF9933', // Saffron
  '#00E5FF', // Cyan
  '#10B981', // Emerald
  '#F43F5E', // Neon Rose
  '#A855F7', // Purple
  '#FACC15', // Electric Yellow
  '#3B82F6', // Royal Blue
  '#EC4899', // Hot Pink
];

const PEER_PREFIX = 'dalalrider-rm-v1-';

class MultiplayerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConn: DataConnection | null = null;
  private bc: BroadcastChannel | null = null;
  public state: RoomState | null = null;
  private listeners: Set<RoomListener> = new Set();
  public myId: string = getPlayerId();
  private finishOrderCounter = 0;

  public subscribe(fn: RoomListener): () => void {
    this.listeners.add(fn);
    if (this.state) fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    if (!this.state) return;
    for (const fn of this.listeners) fn(this.state);
  }

  public disconnect() {
    if (this.bc) {
      try { this.bc.close(); } catch {}
      this.bc = null;
    }
    for (const c of this.connections.values()) {
      try { c.close(); } catch {}
    }
    this.connections.clear();
    if (this.hostConn) {
      try { this.hostConn.close(); } catch {}
      this.hostConn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch {}
      this.peer = null;
    }
    this.state = null;
    this.finishOrderCounter = 0;
  }

  private setupBroadcastChannel(code: string) {
    if (typeof BroadcastChannel === 'undefined') return;
    this.bc = new BroadcastChannel(`dalalrider_room_${code}`);
    this.bc.onmessage = (ev) => {
      this.handleIncomingMessage(ev.data);
    };
  }

  private sendToAll(msg: any) {
    if (this.bc) {
      try { this.bc.postMessage(msg); } catch {}
    }
    if (this.state?.hostId === this.myId) {
      for (const conn of this.connections.values()) {
        if (conn.open) {
          try { conn.send(msg); } catch {}
        }
      }
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch {}
    }
  }

  public generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  public async createRoom(ticker = 'RELIANCE', period = '1y', smooth = false): Promise<string> {
    this.disconnect();
    // Ensure unique per-tab player ID if testing across multiple tabs on same browser
    const tabId = sessionStorage.getItem('dalalrider_tab_id') || `${getPlayerId().slice(0, 8)}_${Math.floor(Math.random() * 9000 + 1000)}`;
    sessionStorage.setItem('dalalrider_tab_id', tabId);
    this.myId = tabId;

    const code = this.generateRoomCode();
    const myPlayer: RoomPlayer = {
      id: this.myId,
      nickname: getNickname(),
      color: PLAYER_COLORS[0],
      isHost: true,
      ready: true,
      x: 120,
      y: 495,
      angle: 0,
      progress: 0,
      score: 0,
      crashes: 0,
      finished: false,
      finishTime: 0,
      finishRank: 0,
      lastUpdate: Date.now(),
    };

    this.state = {
      code,
      hostId: this.myId,
      ticker,
      period,
      smooth,
      status: 'lobby',
      startTime: 0,
      winnerId: null,
      winnerName: null,
      winnerTime: null,
      players: { [this.myId]: myPlayer },
    };

    this.setupBroadcastChannel(code);

    return new Promise((resolve) => {
      try {
        const peer = new Peer(`${PEER_PREFIX}${code}`);
        this.peer = peer;
        const timeout = setTimeout(() => {
          this.notify();
          resolve(code);
        }, 2500);

        peer.on('open', () => {
          clearTimeout(timeout);
          this.notify();
          resolve(code);
        });

        peer.on('connection', (conn) => {
          conn.on('open', () => {
            this.connections.set(conn.peer, conn);
            if (this.state) {
              conn.send({ type: 'ROOM_SYNC', state: this.state });
            }
          });
          conn.on('data', (data) => {
            this.handleIncomingMessage(data, conn);
          });
          conn.on('close', () => {
            this.connections.delete(conn.peer);
          });
        });

        peer.on('error', () => {
          clearTimeout(timeout);
          this.notify();
          resolve(code);
        });
      } catch {
        this.notify();
        resolve(code);
      }
    });
  }

  public async joinRoom(rawCode: string): Promise<boolean> {
    const code = rawCode.trim().toUpperCase();
    if (!code) return false;
    this.disconnect();

    const tabId = sessionStorage.getItem('dalalrider_tab_id') || `${getPlayerId().slice(0, 8)}_${Math.floor(Math.random() * 9000 + 1000)}`;
    sessionStorage.setItem('dalalrider_tab_id', tabId);
    this.myId = tabId;

    this.setupBroadcastChannel(code);

    const joinMsg = {
      type: 'PLAYER_JOIN',
      player: {
        id: this.myId,
        nickname: getNickname(),
      },
    };

    // Request sync over BroadcastChannel immediately (instant if host is on same machine/browser)
    if (this.bc) {
      this.bc.postMessage(joinMsg);
    }

    return new Promise((resolve) => {
      let resolved = false;
      const done = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        resolve(ok);
      };

      // Check if BroadcastChannel already synced within 350ms
      setTimeout(() => {
        if (this.state && this.state.code === code) {
          done(true);
        }
      }, 350);

      try {
        const peer = new Peer();
        this.peer = peer;
        const timer = setTimeout(() => {
          done(!!this.state);
        }, 5500);

        peer.on('open', () => {
          const conn = peer.connect(`${PEER_PREFIX}${code}`, { reliable: true });
          this.hostConn = conn;
          conn.on('open', () => {
            conn.send(joinMsg);
          });
          conn.on('data', (data) => {
            this.handleIncomingMessage(data);
            if (this.state && this.state.code === code) {
              clearTimeout(timer);
              done(true);
            }
          });
          conn.on('error', () => {
            clearTimeout(timer);
            done(!!this.state);
          });
        });

        peer.on('error', () => {
          clearTimeout(timer);
          done(!!this.state);
        });
      } catch {
        done(!!this.state);
      }
    });
  }

  private handleIncomingMessage(msg: any, senderConn?: DataConnection) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ROOM_SYNC' && msg.state) {
      if (this.state?.hostId === this.myId) return; // Host is authoritative
      this.state = msg.state;
      this.notify();
      return;
    }

    if (msg.type === 'PLAYER_JOIN' && msg.player) {
      if (!this.state || this.state.hostId !== this.myId) return;
      const pId = msg.player.id;
      const existing = this.state.players[pId];
      const colorIdx = Object.keys(this.state.players).length % PLAYER_COLORS.length;
      this.state.players[pId] = {
        id: pId,
        nickname: msg.player.nickname || 'Rider',
        color: existing ? existing.color : PLAYER_COLORS[colorIdx],
        isHost: pId === this.state.hostId,
        ready: true,
        x: 120,
        y: 495,
        angle: 0,
        progress: 0,
        score: 0,
        crashes: 0,
        finished: false,
        finishTime: 0,
        finishRank: 0,
        lastUpdate: Date.now(),
      };
      this.broadcastRoomSync();
      return;
    }

    if (msg.type === 'PLAYER_STATE' && msg.id && this.state) {
      const p = this.state.players[msg.id];
      if (p && msg.id !== this.myId) {
        p.x = msg.x;
        p.y = msg.y;
        p.angle = msg.angle;
        p.progress = msg.progress;
        p.score = msg.score;
        p.crashes = msg.crashes;
        p.nickname = msg.nickname || p.nickname;
        p.lastUpdate = Date.now();
      }
      // If we are host, relay to other connected WebRTC peers
      if (this.state.hostId === this.myId) {
        for (const conn of this.connections.values()) {
          if (conn !== senderConn && conn.open) {
            try { conn.send(msg); } catch {}
          }
        }
      }
      this.notify();
      return;
    }

    if (msg.type === 'PLAYER_FINISHED' && msg.id && this.state) {
      const p = this.state.players[msg.id];
      if (p && !p.finished) {
        p.finished = true;
        p.finishTime = msg.time;
        p.score = msg.score;
        p.progress = 1;
        this.finishOrderCounter++;
        p.finishRank = msg.rank || this.finishOrderCounter;
      }
      if (!this.state.winnerId) {
        this.state.winnerId = msg.id;
        this.state.winnerName = p ? p.nickname : (msg.nickname || 'Rider');
        this.state.winnerTime = msg.time;
      }
      if (this.state.hostId === this.myId) {
        this.broadcastRoomSync();
      } else {
        this.notify();
      }
      return;
    }
  }

  public broadcastRoomSync() {
    if (!this.state || this.state.hostId !== this.myId) return;
    this.sendToAll({ type: 'ROOM_SYNC', state: this.state });
    this.notify();
  }

  public updateMyNickname(nickname: string) {
    if (!this.state) return;
    const me = this.state.players[this.myId];
    if (me) {
      me.nickname = nickname;
      if (this.state.hostId === this.myId) {
        this.broadcastRoomSync();
      } else {
        this.sendToAll({
          type: 'PLAYER_JOIN',
          player: { id: this.myId, nickname },
        });
      }
    }
  }

  public setRoomTrack(ticker: string, period: string, smooth: boolean) {
    if (!this.state || this.state.hostId !== this.myId) return;
    this.state.ticker = ticker;
    this.state.period = period;
    this.state.smooth = smooth;
    this.broadcastRoomSync();
  }

  public startRace() {
    if (!this.state || this.state.hostId !== this.myId) return;
    this.finishOrderCounter = 0;
    this.state.winnerId = null;
    this.state.winnerName = null;
    this.state.winnerTime = null;
    for (const p of Object.values(this.state.players)) {
      p.x = 120;
      p.y = 495;
      p.angle = 0;
      p.progress = 0;
      p.score = 0;
      p.crashes = 0;
      p.finished = false;
      p.finishTime = 0;
      p.finishRank = 0;
    }
    this.state.status = 'racing';
    this.state.startTime = Date.now() + 3500; // 3.5s synchronized countdown
    this.broadcastRoomSync();
  }

  public resetToLobby() {
    if (!this.state || this.state.hostId !== this.myId) return;
    this.state.status = 'lobby';
    this.state.winnerId = null;
    this.state.winnerName = null;
    this.state.winnerTime = null;
    this.finishOrderCounter = 0;
    for (const p of Object.values(this.state.players)) {
      p.finished = false;
      p.finishTime = 0;
      p.finishRank = 0;
      p.progress = 0;
    }
    this.broadcastRoomSync();
  }

  public broadcastMyPosition(x: number, y: number, angle: number, progress: number, score: number, crashes: number) {
    if (!this.state) return;
    const me = this.state.players[this.myId];
    if (me) {
      me.x = x;
      me.y = y;
      me.angle = angle;
      me.progress = progress;
      me.score = score;
      me.crashes = crashes;
      me.lastUpdate = Date.now();
    }
    this.sendToAll({
      type: 'PLAYER_STATE',
      id: this.myId,
      nickname: me?.nickname,
      x: Math.round(x),
      y: Math.round(y),
      angle: Math.round(angle * 1000) / 1000,
      progress: Math.round(progress * 1000) / 1000,
      score: Math.floor(score),
      crashes,
    });
  }

  public reportMyFinish(time: number, score: number) {
    if (!this.state) return;
    const me = this.state.players[this.myId];
    if (me && !me.finished) {
      me.finished = true;
      me.finishTime = time;
      me.score = score;
      me.progress = 1;
      const finishedCount = Object.values(this.state.players).filter(p => p.finished).length;
      me.finishRank = finishedCount;
    }
    if (!this.state.winnerId) {
      this.state.winnerId = this.myId;
      this.state.winnerName = me ? me.nickname : getNickname();
      this.state.winnerTime = time;
    }
    this.sendToAll({
      type: 'PLAYER_FINISHED',
      id: this.myId,
      nickname: me?.nickname || getNickname(),
      time: Math.round(time * 100) / 100,
      score: Math.floor(score),
      rank: me?.finishRank || 1,
    });
    if (this.state.hostId === this.myId) {
      this.broadcastRoomSync();
    } else {
      this.notify();
    }
  }
}

export const mp = new MultiplayerManager();
