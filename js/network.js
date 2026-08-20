/* =====================================================================
 * network.js — WebRTC / PeerJS per multiplayer P2P a costo zero.
 *
 * Architettura: NESSUN server di gioco. I browser comunicano
 * direttamente tramite WebRTC DataChannel. Il solo componente esterno
 * è il cloud di signaling gratuito di PeerJS (host pubblico 0.peerjs.com),
 * usato esclusivamente per lo scambio iniziale degli ID.
 *
 * Modello di fiducia: HOST-AUTHORITATIVE.
 *   - L'host crea il Peer e l'ID (codice stanza), l'ospite si connette.
 *   - L'host valida le mosse con l'engine locale e invia lo stato
 *     completo all'ospite via broadcastGameState().
 *   - L'ospite propone mosse e applica gli stati ricevuti.
 *
 * Protocollo dati (JSON sul DataChannel):
 *   { tipo: 'hello',    payload: { nome, ruolo } }
 *   { tipo: 'mossa',    payload: { mossa },       firma }
 *   { tipo: 'stato',    payload: <statoSerializzabile> }
 *   { tipo: 'errore',   payload: { motivo } }
 *   { tipo: 'ping' | 'pong' }  (keep-alive)
 * ===================================================================== */
'use strict';

class GestoreRete {
  constructor() {
    this.peer = null;
    this.connessione = null;      // DataConnection attiva
    this.idLocale = null;         // ID Peer locale (codice stanza se host)
    this.ruolo = null;            // 'host' | 'guest' | null
    this.pronto = false;
    this.coda = [];               // messaggi bufferizzati prima della connessione
    this._pongAtteso = false;

    this.callbacks = {
      onReady: null,          // (idLocale) => void
      onConnesso: null,       // (ruolo, peerId) => void
      onDisconnesso: null,    // () => void
      onData: null,           // (messaggio) => void  (già validato)
      onError: null           // (errore) => void
    };
  }

  /**
   * initPeer(): inizializza il nodo Peer e genera un ID univoco.
   * Il cloud di signaling pubblico è gratuito e non richiede chiavi.
   * Per un'alternativa serverless (es. Firebase Starter / serverless
   * function) basta passare { host, port, secure, path } in opts.cloud.
   */
  initPeer(opts = {}) {
    const {
      onReady, onConnesso, onDisconnesso, onData, onError,
      cloud = {}              // { host, port, secure, path, key, config }
    } = opts;

    if (typeof Peer === 'undefined') {
      const err = new Error('PeerJS non caricato: il multiplayer P2P richiede la libreria PeerJS (CDN gratuito).');
      if (onError) onError(err);
      throw err;
    }

    this.callbacks = { onReady, onConnesso, onDisconnesso, onData, onError };

    // ID univoco leggibile (codice stanza). Con PeerJS si può anche
    // omettere per ottenere un ID casuale autogenerato.
    const id = opts.id || `carte-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // ICE servers STUN gratuiti (niente TURN a pagamento; in NAT
    // simmetrici fallback su host pubblico). Configurabile in opts.cloud.
    const config = cloud.config || {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peer = new Peer(id, {
      debug: 1,
      config,
      ...(cloud.host ? {
        host: cloud.host,
        port: cloud.port || 443,
        secure: cloud.secure !== false,
        path: cloud.path || '/',
        key: cloud.key
      } : {}) // nessun host => cloud pubblico gratuito di PeerJS
    });

    this.peer.on('open', (idRicevuto) => {
      this.idLocale = idRicevuto;
      this.pronto = true;
      if (this.callbacks.onReady) this.callbacks.onReady(idRicevuto);
      // svuota la coda dei messaggi inviati prima della connessione
      while (this.coda.length) {
        const msg = this.coda.shift();
        this._invia(msg);
      }
    });

    // Riceviamo una connessione in ingresso => siamo l'host
    this.peer.on('connection', (conn) => {
      this.ruolo = 'host';
      this.connessione = conn;
      this._agganciaConnessione(conn);
      if (this.callbacks.onConnesso) this.callbacks.onConnesso('host', conn.peer);
    });

    this.peer.on('disconnected', () => {
      // il client è andato offline dal signaling: si tenta la riconnessione
      if (this.peer && !this.peer.destroyed) this.peer.reconnect();
      if (this.callbacks.onDisconnesso) this.callbacks.onDisconnesso();
    });

    this.peer.on('error', (err) => {
      if (this.callbacks.onError) this.callbacks.onError(err);
    });

    // keep-alive: evita la chiusura dei DataChannel per inattività
    setInterval(() => this._ping(), 25000);
    return this;
  }

  /**
   * connectToPeer(targetId): avvia una connessione diretta verso un altro
   * giocatore tramite il suo ID. Chi chiama diventa 'guest'.
   */
  connectToPeer(targetId) {
    return new Promise((resolve, reject) => {
      if (!this.peer || !this.pronto) {
        reject(new Error('Peer non inizializzato: chiama initPeer() prima'));
        return;
      }
      const conn = this.peer.connect(targetId, { reliable: true });
      this.ruolo = 'guest';
      this.connessione = conn;
      this._agganciaConnessione(conn);
      conn.on('open', () => {
        if (this.callbacks.onConnesso) this.callbacks.onConnesso('guest', conn.peer);
        resolve(conn);
      });
      conn.on('error', (err) => {
        if (this.callbacks.onError) this.callbacks.onError(err);
        reject(err);
      });
    });
  }

  _agganciaConnessione(conn) {
    conn.on('data', (raw) => {
      const msg = this.handleIncomingData(raw);
      if (msg && this.callbacks.onData) this.callbacks.onData(msg);
    });
    conn.on('close', () => {
      if (this.callbacks.onDisconnesso) this.callbacks.onDisconnesso();
    });
    conn.on('error', (err) => {
      if (this.callbacks.onError) this.callbacks.onError(err);
    });
  }

  /**
   * broadcastGameState(state): invia lo stato del tavolo (carte giocate,
   * punteggi) all'avversario in JSON via DataChannel. Ritorna true se inviato.
   */
  broadcastGameState(state) {
    const msg = { tipo: 'stato', payload: state, ts: Date.now() };
    return this._invia(msg);
  }

  /** Invia una proposta di mossa all'host (usato dal guest). */
  inviaMossa(mossa) {
    return this._invia({ tipo: 'mossa', payload: mossa, firma: `g-${Date.now()}` });
  }

  inviaErrore(motivo) {
    return this._invia({ tipo: 'errore', payload: { motivo } });
  }

  _ping() {
    if (this.connessione && this.connessione.open && !this._pongAtteso) {
      this._pongAtteso = true;
      this.connessione.send({ tipo: 'ping' });
      setTimeout(() => { this._pongAtteso = false; }, 5000);
    }
  }

  _invia(msg) {
    if (this.connessione && this.connessione.open) {
      this.connessione.send(msg);
      return true;
    }
    this.coda.push(msg); // bufferizza finché non c'è connessione
    return false;
  }

  /**
   * handleIncomingData(data): riceve la mossa/stato dell'avversario,
   * valida l'integrità della struttura e restituisce un messaggio
   * normalizzato, oppure null se il dato è malformato (anti-tampering).
   */
  handleIncomingData(data) {
    // 1) integrità di base
    if (!data || typeof data !== 'object' || typeof data.tipo !== 'string') return null;
    if (typeof data.payload === 'undefined' && data.tipo !== 'ping' && data.tipo !== 'pong') return null;

    switch (data.tipo) {
      case 'ping':
        this._invia({ tipo: 'pong' });
        return { tipo: 'pong' };
      case 'pong':
        this._pongAtteso = false;
        return null;
      case 'hello':
        if (typeof data.payload !== 'object' || typeof data.payload.nome !== 'string') return null;
        return { tipo: 'hello', payload: data.payload };
      case 'mossa':
        if (typeof data.payload !== 'object' || data.payload === null) return null;
        if (typeof data.payload.tipo !== 'string') return null;
        return { tipo: 'mossa', payload: data.payload, firma: data.firma || null };
      case 'stato':
        if (typeof data.payload !== 'object' || data.payload === null) return null;
        if (typeof data.payload.gioco !== 'string' || typeof data.payload.fase !== 'string') return null;
        return { tipo: 'stato', payload: data.payload };
      case 'errore':
        if (typeof data.payload !== 'object' || typeof data.payload.motivo !== 'string') return null;
        return { tipo: 'errore', payload: data.payload };
      default:
        return null; // tipo sconosciuto => scartato
    }
  }

  /** Chiude la connessione e distrugge il Peer. */
  chiudi() {
    if (this.connessione) { try { this.connessione.close(); } catch (e) { /* noop */ } }
    if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch (e) { /* noop */ } }
    this.peer = null;
    this.connessione = null;
    this.ruolo = null;
    this.pronto = false;
  }
}

/* Istanza singola condivisa (singleton) */
const rete = new GestoreRete();

/* Esposizione globale (script non-module) */
if (typeof window !== 'undefined') {
  window.GestoreRete = GestoreRete;
  window.rete = rete;
}