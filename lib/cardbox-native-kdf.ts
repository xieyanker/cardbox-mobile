export type PasswordDeriver = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  length: number,
  firstBlock: number,
) => Promise<Uint8Array>;

let nativeDeriver: PasswordDeriver | null = null;
export function registerPasswordDeriver(derive: PasswordDeriver) {
  nativeDeriver = derive;
  return () => {
    if (nativeDeriver === derive) nativeDeriver = null;
  };
}
export function getNativePasswordDeriver() {
  return nativeDeriver;
}

export type DerivationRequest = {
  id: number;
  password: number[];
  salt: number[];
  iterations: number;
  length: number;
};
type Pending = {
  request: DerivationRequest;
  offset: number;
  length: number;
  resolve: (bytes: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Only password derivation crosses this local bridge; no card or file data. */
export class NativePasswordBridge {
  private sequence = 0;
  private ready = false;
  private failure: Error | null = null;
  private pending = new Map<number, Pending>();
  constructor(private send: (request: DerivationRequest) => void) {}
  activate() {
    this.failure = null;
    this.ready = false;
  }

  derive: PasswordDeriver = (
    password,
    salt,
    iterations,
    length,
    firstBlock,
  ) => {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    const offset = (firstBlock - 1) * 32;
    return new Promise((resolve, reject) => {
      const request = {
        id,
        password: Array.from(password),
        salt: Array.from(salt),
        iterations,
        length: offset + length,
      };
      const timer = setTimeout(
        () =>
          this.finish(id, new Error("密码处理超时，请保持应用在前台并重试。")),
        15_000,
      );
      this.pending.set(id, { request, offset, length, resolve, reject, timer });
      if (this.ready) this.dispatch(id);
    });
  };
  private dispatch(id: number) {
    const job = this.pending.get(id);
    if (!job) return;
    try {
      this.send(job.request);
    } catch {
      this.finish(id, new Error("本机密码处理服务不可用，请重新打开应用。"));
    } finally {
      job.request.password.fill(0);
      job.request.salt.fill(0);
    }
  }
  private finish(id: number, error?: Error, bytes?: Uint8Array) {
    const job = this.pending.get(id);
    if (!job) {
      bytes?.fill(0);
      return;
    }
    this.pending.delete(id);
    clearTimeout(job.timer);
    job.request.password.fill(0);
    job.request.salt.fill(0);
    if (error) job.reject(error);
    else {
      job.resolve(bytes!.slice(job.offset, job.offset + job.length));
      bytes!.fill(0);
    }
  }
  receive(value: string) {
    let message: {
      type?: string;
      available?: boolean;
      id?: number;
      bytes?: number[];
      error?: boolean;
    };
    try {
      message = JSON.parse(value);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.type === "ready") {
      if (this.ready) return;
      if (!message.available) {
        this.fail(
          "系统密码加速服务不可用，请更新 Android System WebView 后重试。",
        );
        return;
      }
      this.ready = true;
      for (const id of this.pending.keys()) this.dispatch(id);
      return;
    }
    const id = message.id;
    if (typeof id !== "number") return;
    const job = this.pending.get(id);
    if (!job) return;
    if (
      message.error ||
      !Array.isArray(message.bytes) ||
      message.bytes.length !== job.request.length ||
      !message.bytes.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
      )
    ) {
      this.finish(id, new Error("本机密码处理失败，请重试。"));
      return;
    }
    this.finish(id, undefined, Uint8Array.from(message.bytes));
    message.bytes.fill(0);
  }
  fail(message = "本机密码处理服务已关闭，请重新打开应用。") {
    this.failure = new Error(message);
    this.ready = false;
    for (const id of this.pending.keys()) this.finish(id, this.failure);
  }
}

// Inline document: HTTPS base URL supplies a secure origin without any network load.
// CSP blocks all network, storage is disabled by the native component.
export const PASSWORD_SERVICE_ORIGIN = "https://cardbox.invalid/";
export function isPasswordServiceUrl(url: string) {
  return (
    url === PASSWORD_SERVICE_ORIGIN ||
    url === PASSWORD_SERVICE_ORIGIN.slice(0, -1) ||
    url === "about:blank"
  );
}
export const PASSWORD_SERVICE_HTML = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-cardbox-kdf'; connect-src 'none'; form-action 'none'; base-uri 'none'">
</head><body><script nonce="cardbox-kdf">
(function () {
  function send(value) { window.ReactNativeWebView.postMessage(JSON.stringify(value)); }
  window.cardboxDerive = function (request) {
    var password = new Uint8Array(request.password);
    var salt = new Uint8Array(request.salt);
    request.password.fill(0); request.salt.fill(0);
    var bytes;
    crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        password.fill(0);
        return crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:salt, iterations:request.iterations}, key, request.length * 8);
      }).then(function (bits) {
        bytes = new Uint8Array(bits);
        send({id:request.id, bytes:Array.from(bytes)});
      }).catch(function () { send({id:request.id, error:true}); })
      .finally(function () { password.fill(0); salt.fill(0); if (bytes) bytes.fill(0); });
  };
  send({type:'ready', available:!!(window.isSecureContext && window.crypto && crypto.subtle)});
})();
</script></body></html>`;
