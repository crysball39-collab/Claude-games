// A stand-in for "@minecraft/server-net" (web requests, on a dedicated server): requests are
// checked as the game checks them and kept in net.requests; net.handler(request) decides the
// answer ({status, body}), which arrives asynchronously like a real one.
export const HttpRequestMethod = { Delete: "Delete", Get: "Get", Head: "Head", Post: "Post", Put: "Put" };

export class HttpHeader {
  constructor(key, value) {
    if (typeof key !== "string" || !key) throw new Error("header key must be a string");
    if (typeof value !== "string") throw new Error("header " + key + " value must be a string");
    this.key = key;
    this.value = value;
  }
}

export class HttpRequest {
  constructor(uri) {
    if (typeof uri !== "string" || !/^https?:\/\//.test(uri)) throw new Error("bad request uri " + uri);
    this.uri = uri;
    this.method = HttpRequestMethod.Get;
    this.headers = [];
    this.body = "";
    this.timeout = 10;
  }
  addHeader(key, value) {
    this.headers.push(new HttpHeader(key, value));
    return this;
  }
  setBody(body) {
    if (typeof body !== "string") throw new Error("body must be a string here");
    this.body = body;
    return this;
  }
  setHeaders(headers) {
    if (!Array.isArray(headers) || !headers.every((h) => h instanceof HttpHeader)) throw new Error("headers must be HttpHeader objects");
    this.headers = headers;
    return this;
  }
  setMethod(method) {
    if (!Object.values(HttpRequestMethod).includes(method)) throw new Error("bad method " + method);
    this.method = method;
    return this;
  }
  setTimeout(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("bad timeout " + seconds);
    this.timeout = seconds;
    return this;
  }
}

/** What the tests see and decide. */
export const net = {
  /** @type {HttpRequest[]} */
  requests: [],
  /** @type {((req: HttpRequest) => {status: number, body: string} | Promise<{status: number, body: string}>) | undefined} */
  handler: undefined,
  /** requests sent and not yet answered */
  open: 0,
};

export const http = {
  request(req) {
    if (!(req instanceof HttpRequest)) throw new Error("http.request takes an HttpRequest");
    net.requests.push(req);
    net.open++;
    return Promise.resolve()
      .then(() => (net.handler ? net.handler(req) : { status: 404, body: "" }))
      .then((r) => ({ status: r.status, body: r.body, headers: [], request: req }))
      .finally(() => net.open--);
  },
  get(uri) {
    return this.request(new HttpRequest(uri));
  },
  cancelAll() {},
};
