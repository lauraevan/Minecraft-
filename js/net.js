// ---------------------------------------------------------------
// net.js — P2P co-op multiplayer over WebRTC (PeerJS cloud signaling)
// Host is world authority: shares seed + modified chunks on join,
// relays block changes, streams mob snapshots; everyone streams
// their own position. Guests puppet the host's mobs.
// ---------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.random() * CODE_CHARS.length | 0];
  return c;
}
const PREFIX = 'craftermine-';

export class Net {
  constructor() {
    this.peer = null;
    this.conns = [];       // host: all guest conns; guest: [hostConn]
    this.isHost = false;
    this.active = false;
    this.remotePlayers = new Map(); // peerId -> {x,y,z,yaw,pitch, avatar}
    this.onInit = null;    // guest: cb(initData)
    this.onBlock = null;   // cb(x,y,z,id)
    this.onMobs = null;    // guest: cb(snapshot)
    this.onHit = null;     // host: cb(mobIndex, dmg)
    this.onStatus = null;  // cb(text)
    this.onPeerCount = null;
    this.sendTimer = 0;
    this.mobTimer = 0;
    this.applyingRemote = false;
  }

  status(t) { if (this.onStatus) this.onStatus(t); }

  host(getInitData) {
    return new Promise((resolve, reject) => {
      const code = makeCode();
      this.peer = new Peer(PREFIX + code);
      this.peer.on('open', () => {
        this.isHost = true; this.active = true;
        this.status('Hosting — waiting for friends…');
        resolve(code);
      });
      this.peer.on('error', e => { this.status('Network error: ' + e.type); reject(e); });
      this.peer.on('connection', conn => {
        conn.on('open', () => {
          this.conns.push(conn);
          this.status('Player joined! (' + (this.conns.length + 1) + ' players)');
          if (this.onPeerCount) this.onPeerCount(this.conns.length);
          conn.send({ t: 'init', d: getInitData() });
        });
        conn.on('data', m => this.handle(conn, m));
        conn.on('close', () => {
          this.conns = this.conns.filter(c => c !== conn);
          this.dropPlayer(conn.peer);
          this.status('A player left. (' + (this.conns.length + 1) + ' players)');
        });
      });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      this.peer.on('error', e => { this.status('Could not join: ' + e.type); reject(e); });
      this.peer.on('open', () => {
        const conn = this.peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
        conn.on('open', () => {
          this.conns = [conn]; this.active = true; this.isHost = false;
          this.status('Connected! Loading world…');
        });
        conn.on('data', m => {
          if (m.t === 'init') { resolve(m.d); }
          this.handle(conn, m);
        });
        conn.on('close', () => { this.status('Disconnected from host.'); this.active = false; });
        setTimeout(() => { if (!this.active) { this.status('No response — check the code.'); reject(new Error('timeout')); } }, 12000);
      });
    });
  }

  handle(conn, m) {
    switch (m.t) {
      case 'b':
        if (this.onBlock) this.onBlock(m.x, m.y, m.z, m.id);
        if (this.isHost) this.broadcast(m, conn); // relay to other guests
        break;
      case 'p': {
        let rp = this.remotePlayers.get(conn.peer);
        if (!rp) { rp = {}; this.remotePlayers.set(conn.peer, rp); }
        Object.assign(rp, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch });
        if (this.isHost) this.broadcast({ ...m, t: 'rp', id: conn.peer }, conn);
        break;
      }
      case 'rp': { // relayed remote player (guest side)
        if (m.id === this.peer.id) break;
        let rp = this.remotePlayers.get(m.id);
        if (!rp) { rp = {}; this.remotePlayers.set(m.id, rp); }
        Object.assign(rp, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch });
        break;
      }
      case 'm': if (!this.isHost && this.onMobs) this.onMobs(m.d); break;
      case 'hit': if (this.isHost && this.onHit) this.onHit(m.i, m.dmg); break;
      case 'time': if (!this.isHost && this.onTime) this.onTime(m.v); break;
    }
  }

  dropPlayer(id) {
    const rp = this.remotePlayers.get(id);
    if (rp && rp.avatar && this.scene) this.scene.remove(rp.avatar.group);
    this.remotePlayers.delete(id);
  }

  broadcast(msg, except = null) {
    for (const c of this.conns) if (c !== except && c.open) c.send(msg);
  }

  sendBlock(x, y, z, id) {
    if (this.active && !this.applyingRemote) this.broadcast({ t: 'b', x, y, z, id });
  }

  // called every frame by main
  tick(dt, player, entities, world) {
    if (!this.active) return;
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 0.1; // 10 Hz position
      this.broadcast({ t: 'p', x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, pitch: player.pitch });
    }
    if (this.isHost) {
      this.mobTimer -= dt;
      if (this.mobTimer <= 0) {
        this.mobTimer = 0.34; // 3 Hz mob snapshots
        const d = entities.mobs.slice(0, 40).map(m => ({
          k: m.type, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2),
          w: +m.yaw.toFixed(2), h: m.hp, f: m.hurtTimer > 0 ? 1 : 0,
        }));
        this.broadcast({ t: 'm', d });
        this.broadcast({ t: 'time', v: world.time });
      }
    }
  }
}
