var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
if (!("__unenv__" in performance)) {
  const proto = Performance.prototype;
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key !== "constructor" && !(key in performance)) {
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc) {
        Object.defineProperty(performance, key, desc);
      }
    }
  }
}
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var unenvProcess = new Process({
  env: globalProcess.env,
  hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  _channel,
  _debugEnd,
  _debugProcess,
  _disconnect,
  _events,
  _eventsCount,
  _exiting,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _handleQueue,
  _kill,
  _linkedBinding,
  _maxListeners,
  _pendingMessage,
  _preload_modules,
  _rawDebug,
  _send,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  assert: assert2,
  availableMemory,
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  dlopen,
  domain,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime: hrtime3,
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  mainModule,
  memoryUsage,
  moduleLoadList,
  nextTick,
  off,
  on,
  once,
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// api/checkout-status.ts
async function onRequestGet(context2) {
  const { request, env: env2 } = context2;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing session_id parameter." }), {
      status: 400,
      headers: corsHeaders
    });
  }
  if (sessionId.startsWith("cs_mock_")) {
    return new Response(
      JSON.stringify({
        paid: true,
        sessionId,
        status: "complete",
        mock: true
      }),
      { status: 200, headers: corsHeaders }
    );
  }
  const STRIPE_SECRET_KEY = env2.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes("placeholder")) {
    return new Response(
      JSON.stringify({ error: "Stripe secret key unconfigured." }),
      { status: 503, headers: corsHeaders }
    );
  }
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Session lookup failed.", status: res.status }), {
        status: res.status,
        headers: corsHeaders
      });
    }
    const session = await res.json();
    const paid = session.payment_status === "paid";
    return new Response(
      JSON.stringify({
        paid,
        sessionId,
        status: session.status
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status inquiry error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(onRequestGet, "onRequestGet");

// ../src/lib/security.ts
function validateCartItems(rawItems, catalog) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { valid: false, error: "Cart is empty.", items: [], subtotalCents: 0 };
  }
  if (rawItems.length > 20) {
    return { valid: false, error: "Cart exceeds maximum allowed 20 items.", items: [], subtotalCents: 0 };
  }
  const validated = [];
  let subtotalCents = 0;
  for (const item of rawItems) {
    if (!item || typeof item !== "object") {
      return { valid: false, error: "Malformed item structure in cart.", items: [], subtotalCents: 0 };
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return { valid: false, error: "Invalid item quantity. Must be between 1 and 20.", items: [], subtotalCents: 0 };
    }
    const artwork = catalog.find(
      (a) => a.id === item.artworkId || a.slug === item.artworkId
    );
    if (!artwork) {
      return { valid: false, error: `Artwork not found in authoritative catalog: ${item.artworkId}`, items: [], subtotalCents: 0 };
    }
    const variant = artwork.variants.find((v) => v.sku === item.variantSku);
    if (!variant) {
      return { valid: false, error: `Invalid variant SKU for artwork "${artwork.title}": ${item.variantSku}`, items: [], subtotalCents: 0 };
    }
    const unitAmountCents = Math.round(variant.retailPriceUsd * 100);
    if (!Number.isSafeInteger(unitAmountCents) || unitAmountCents <= 0) {
      return { valid: false, error: "Invalid price calculation.", items: [], subtotalCents: 0 };
    }
    subtotalCents += unitAmountCents * quantity;
    validated.push({
      artworkId: artwork.id,
      artworkTitle: artwork.title,
      slug: artwork.slug,
      variantSku: variant.sku,
      substrate: variant.substrate,
      substrateName: variant.substrateName,
      size: variant.size,
      quantity,
      unitAmountCents,
      lab: variant.lab,
      supplierSku: variant.supplierSku,
      previewImage: artwork.previewImage
    });
  }
  return {
    valid: true,
    items: validated,
    subtotalCents
  };
}
__name(validateCartItems, "validateCartItems");
async function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  try {
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const sigPart = parts.find((p) => p.startsWith("v1="));
    if (!timestampPart || !sigPart) return false;
    const timestamp = timestampPart.split("=")[1];
    const signature = sigPart.split("=")[1];
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const signedPayload = `${timestamp}.${rawBody}`;
    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(signedPayload)
    );
  } catch {
    return false;
  }
}
__name(verifyWebhookSignature, "verifyWebhookSignature");

// ../src/lib/fulfillment.ts
async function generateExternalOrderId(sessionId, lab) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`awp:${lab}:${sessionId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
  if (lab === "printify") return `awp_pfy_${hash}`;
  if (lab === "printful") return `awp_pfl_${hash}`;
  if (lab === "prodigi") return `awp_prd_${hash}`;
  if (lab === "gelato") return `awp_glt_${hash}`;
  return `awp_gtn_${hash}`;
}
__name(generateExternalOrderId, "generateExternalOrderId");
function calculateSplitCartShipping(items, destinationCountry = "US") {
  const isDomestic = destinationCountry.toUpperCase() === "US";
  const labGroups = /* @__PURE__ */ new Map();
  for (const item of items) {
    const existing = labGroups.get(item.lab) || [];
    existing.push(item);
    labGroups.set(item.lab, existing);
  }
  const parcels = [];
  for (const [lab, groupItems] of labGroups.entries()) {
    const totalUnits = groupItems.reduce((acc, curr) => acc + curr.quantity, 0);
    const additionalUnits = Math.max(0, totalUnits - 1);
    let providerName = "";
    let packageType = "";
    let baseRate = 0;
    let addlRate = 0;
    switch (lab) {
      case "prodigi":
        providerName = "Prodigi Fine-Art Lab";
        packageType = "Heavy-Duty Rigid Art Tube & Archival Crate";
        baseRate = isDomestic ? 1250 : 1950;
        addlRate = isDomestic ? 350 : 500;
        break;
      case "printify":
        providerName = "Printify Workshop";
        packageType = "Corner-Protected Reinforced Flat-Pack";
        baseRate = isDomestic ? 750 : 1450;
        addlRate = isDomestic ? 250 : 400;
        break;
      case "printful":
        providerName = "Printful Fulfillment Center";
        packageType = "Custom Corrugated Heavyweight Box";
        baseRate = isDomestic ? 850 : 1550;
        addlRate = isDomestic ? 300 : 450;
        break;
      case "gelato":
        providerName = "Gelato Global Print Facility";
        packageType = "Locally Produced Heavy-Wall Postal Tube";
        baseRate = isDomestic ? 700 : 1150;
        addlRate = isDomestic ? 200 : 300;
        break;
      case "gooten":
        providerName = "Gooten Decor Facility";
        packageType = "Shock-Absorbent Poly-Foam Acrylic Enclosure";
        baseRate = isDomestic ? 950 : 1650;
        addlRate = isDomestic ? 350 : 500;
        break;
    }
    const additionalItemsCost = additionalUnits * addlRate;
    const totalParcelCost = baseRate + additionalItemsCost;
    parcels.push({
      lab,
      providerName,
      packageType,
      itemCount: totalUnits,
      baseShippingCents: baseRate,
      additionalItemsShippingCents: additionalItemsCost,
      totalShippingCents: totalParcelCost,
      items: groupItems
    });
  }
  const totalShippingCents = parcels.reduce((sum, p) => sum + p.totalShippingCents, 0);
  const vendorCount = parcels.length;
  const isMultiVendor = vendorCount > 1;
  const logisticsSummary = isMultiVendor ? `Split-Shipment: Order routed across ${vendorCount} distinct specialized print facilities with discrete protective parcels.` : `Single-Parcel Shipment: Directly fulfilled from specialized ${parcels[0]?.providerName || "lab"}.`;
  return {
    parcels,
    totalShippingCents,
    isMultiVendor,
    vendorCount,
    logisticsSummary
  };
}
__name(calculateSplitCartShipping, "calculateSplitCartShipping");
async function dispatchProdigiOrder(externalId, order, items, env2) {
  const apiKey = env2.PRODIGI_API_KEY;
  if (!apiKey || env2.ALLOW_MOCK_DISPATCH === "1") {
    return {
      lab: "prodigi",
      providerName: "Prodigi Fine-Art Lab",
      status: "mocked",
      externalOrderId: externalId,
      labOrderId: `prodigi_mock_${Date.now()}`
    };
  }
  const payload = {
    idempotencyKey: externalId,
    merchantReference: externalId,
    shippingMethod: "Standard",
    recipient: {
      name: order.recipient.name,
      email: order.recipient.email,
      phoneNumber: order.recipient.phone || "",
      address: {
        line1: order.recipient.address1,
        line2: order.recipient.address2 || "",
        postalOrZipCode: order.recipient.postalCode,
        townOrCity: order.recipient.city,
        stateOrCounty: order.recipient.state,
        countryCode: order.recipient.countryCode
      }
    },
    items: items.map((item) => ({
      merchantReference: item.sku,
      sku: item.supplierSku.replace(/^prodigi:/, ""),
      copies: item.quantity,
      sizing: "fillPrintArea",
      assets: [
        {
          printArea: "default",
          url: item.printAssetUrl
        }
      ]
    }))
  };
  const res = await fetch("https://api.prodigi.com/v4.0/Orders", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Prodigi API error HTTP ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  return {
    lab: "prodigi",
    providerName: "Prodigi Fine-Art Lab",
    status: "dispatched",
    externalOrderId: externalId,
    labOrderId: data.order?.id || externalId
  };
}
__name(dispatchProdigiOrder, "dispatchProdigiOrder");
async function dispatchPrintifyOrder(externalId, order, items, env2) {
  const token = env2.PRINTIFY_API_TOKEN;
  const shopId = env2.PRINTIFY_SHOP_ID;
  if (!token || !shopId || env2.ALLOW_MOCK_DISPATCH === "1") {
    return {
      lab: "printify",
      providerName: "Printify Workshop",
      status: "mocked",
      externalOrderId: externalId,
      labOrderId: `printify_mock_${Date.now()}`
    };
  }
  const names = order.recipient.name.split(" ");
  const firstName = names[0] || "Art";
  const lastName = names.slice(1).join(" ") || "Patron";
  const payload = {
    external_id: externalId,
    line_items: items.map((item) => ({
      product_id: item.supplierProductId || item.supplierSku.replace(/^printify:/, ""),
      variant_id: Number(item.supplierVariantId || 1),
      quantity: item.quantity
    })),
    shipping_method: 1,
    send_shipping_notification: false,
    address_to: {
      first_name: firstName,
      last_name: lastName,
      email: order.recipient.email,
      phone: order.recipient.phone || "",
      country: order.recipient.countryCode,
      region: order.recipient.state,
      address1: order.recipient.address1,
      address2: order.recipient.address2 || "",
      city: order.recipient.city,
      zip: order.recipient.postalCode
    }
  };
  const res = await fetch(`https://api.printify.com/v1/shops/${shopId}/orders.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Printify API error HTTP ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  return {
    lab: "printify",
    providerName: "Printify Workshop",
    status: "dispatched",
    externalOrderId: externalId,
    labOrderId: String(data.id || externalId)
  };
}
__name(dispatchPrintifyOrder, "dispatchPrintifyOrder");
async function dispatchPrintfulOrder(externalId, order, items, env2) {
  const token = env2.PRINTFUL_API_TOKEN;
  if (!token || env2.ALLOW_MOCK_DISPATCH === "1") {
    return {
      lab: "printful",
      providerName: "Printful Fulfillment Center",
      status: "mocked",
      externalOrderId: externalId,
      labOrderId: `printful_mock_${Date.now()}`
    };
  }
  const payload = {
    external_id: externalId,
    recipient: {
      name: order.recipient.name,
      email: order.recipient.email,
      phone: order.recipient.phone || "",
      address1: order.recipient.address1,
      address2: order.recipient.address2 || "",
      city: order.recipient.city,
      state_code: order.recipient.state,
      country_code: order.recipient.countryCode,
      zip: order.recipient.postalCode
    },
    items: items.map((item) => ({
      sync_variant_id: item.supplierVariantId || item.supplierSku.replace(/^printful:/, ""),
      quantity: item.quantity,
      retail_price: (item.unitPriceCents / 100).toFixed(2)
    })),
    retail_costs: { currency: order.currency || "USD" }
  };
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  if (env2.PRINTFUL_STORE_ID) {
    headers["X-PF-Store-Id"] = env2.PRINTFUL_STORE_ID;
  }
  const res = await fetch("https://api.printful.com/orders?confirm=true", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Printful API error HTTP ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  return {
    lab: "printful",
    providerName: "Printful Fulfillment Center",
    status: "dispatched",
    externalOrderId: externalId,
    labOrderId: String(data.result?.id || externalId)
  };
}
__name(dispatchPrintfulOrder, "dispatchPrintfulOrder");
async function dispatchGelatoOrder(externalId, order, items, env2) {
  const apiKey = env2.GELATO_API_KEY;
  if (!apiKey || env2.ALLOW_MOCK_DISPATCH === "1") {
    return {
      lab: "gelato",
      providerName: "Gelato Global Print Facility",
      status: "mocked",
      externalOrderId: externalId,
      labOrderId: `gelato_mock_${Date.now()}`
    };
  }
  const names = order.recipient.name.split(" ");
  const firstName = names[0] || "Collector";
  const lastName = names.slice(1).join(" ") || "Patron";
  const payload = {
    orderReferenceId: externalId,
    customerReferenceId: order.orderNumber,
    currency: order.currency || "USD",
    orderType: "order",
    shippingAddress: {
      firstName,
      lastName,
      addressLine1: order.recipient.address1,
      addressLine2: order.recipient.address2 || "",
      city: order.recipient.city,
      postCode: order.recipient.postalCode,
      state: order.recipient.state,
      country: order.recipient.countryCode,
      email: order.recipient.email,
      phone: order.recipient.phone || ""
    },
    items: items.map((item) => ({
      itemReferenceId: item.sku,
      productUid: item.supplierSku.replace(/^gelato:/, ""),
      quantity: item.quantity,
      files: [
        {
          type: "default",
          url: item.printAssetUrl
        }
      ]
    }))
  };
  const res = await fetch("https://order.gelatoapis.com/v2/orders", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gelato API error HTTP ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  return {
    lab: "gelato",
    providerName: "Gelato Global Print Facility",
    status: "dispatched",
    externalOrderId: externalId,
    labOrderId: data.id || externalId
  };
}
__name(dispatchGelatoOrder, "dispatchGelatoOrder");
async function dispatchGootenOrder(externalId, order, items, env2) {
  const recipeId = env2.GOOTEN_RECIPE_ID;
  if (!recipeId || env2.ALLOW_MOCK_DISPATCH === "1") {
    return {
      lab: "gooten",
      providerName: "Gooten Decor Facility",
      status: "mocked",
      externalOrderId: externalId,
      labOrderId: `gooten_mock_${Date.now()}`
    };
  }
  const names = order.recipient.name.split(" ");
  const firstName = names[0] || "Collector";
  const lastName = names.slice(1).join(" ") || "Patron";
  const payload = {
    ShipToAddress: {
      FirstName: firstName,
      LastName: lastName,
      Line1: order.recipient.address1,
      Line2: order.recipient.address2 || "",
      City: order.recipient.city,
      State: order.recipient.state,
      PostalCode: order.recipient.postalCode,
      CountryCode: order.recipient.countryCode,
      Email: order.recipient.email,
      Phone: order.recipient.phone || ""
    },
    Items: items.map((item) => ({
      SKU: item.supplierSku.replace(/^gooten:/, ""),
      Quantity: item.quantity,
      Images: [{ Url: item.printAssetUrl }]
    })),
    Payment: { CurrencyCode: order.currency || "USD" },
    IsPreSubmit: false
  };
  const res = await fetch(`https://api.gooten.com/v1/orders/?recipeid=${recipeId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gooten API error HTTP ${res.status}: ${errorText}`);
  }
  const data = await res.json();
  return {
    lab: "gooten",
    providerName: "Gooten Decor Facility",
    status: "dispatched",
    externalOrderId: externalId,
    labOrderId: String(data.Id || externalId)
  };
}
__name(dispatchGootenOrder, "dispatchGootenOrder");
async function routeOrder(order, env2) {
  const labGroups = /* @__PURE__ */ new Map();
  for (const item of order.items) {
    const existing = labGroups.get(item.lab) || [];
    existing.push(item);
    labGroups.set(item.lab, existing);
  }
  const parcelResults = [];
  const errors = [];
  for (const [lab, items] of labGroups.entries()) {
    try {
      const externalId = await generateExternalOrderId(order.sessionId, lab);
      let result;
      switch (lab) {
        case "prodigi":
          result = await dispatchProdigiOrder(externalId, order, items, env2);
          break;
        case "printify":
          result = await dispatchPrintifyOrder(externalId, order, items, env2);
          break;
        case "printful":
          result = await dispatchPrintfulOrder(externalId, order, items, env2);
          break;
        case "gelato":
          result = await dispatchGelatoOrder(externalId, order, items, env2);
          break;
        case "gooten":
          result = await dispatchGootenOrder(externalId, order, items, env2);
          break;
        default:
          throw new Error(`Unsupported lab provider: ${lab}`);
      }
      parcelResults.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Lab [${lab}] dispatch failed: ${message}`);
      parcelResults.push({
        lab,
        providerName: lab,
        status: "failed",
        externalOrderId: `failed_${lab}_${order.sessionId}`,
        error: message
      });
    }
  }
  const allSuccess = parcelResults.length > 0 && parcelResults.every((p) => p.status !== "failed");
  return {
    success: allSuccess,
    orderNumber: order.orderNumber,
    totalParcels: parcelResults.length,
    parcels: parcelResults,
    errors
  };
}
__name(routeOrder, "routeOrder");

// api/create-checkout-session.ts
async function onRequestPost(context2) {
  try {
    const { request, env: env2 } = context2;
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    };
    const body = await request.json();
    const rawItems = body.items;
    const catalogRes = await fetch(`${origin}/data/artworks.json`);
    let catalog = [];
    if (catalogRes.ok) {
      catalog = await catalogRes.json();
    } else {
      console.warn("Could not load /data/artworks.json; checking catalog array");
    }
    const validation = validateCartItems(rawItems, catalog);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: corsHeaders
      });
    }
    const validatedItems = validation.items;
    const fulfillmentItems = validatedItems.map((v) => ({
      id: v.variantSku,
      sku: v.variantSku,
      artworkId: v.artworkId,
      artworkTitle: v.artworkTitle,
      substrate: v.substrate,
      size: v.size,
      quantity: v.quantity,
      unitPriceCents: v.unitAmountCents,
      lab: v.lab,
      supplierSku: v.supplierSku,
      printAssetUrl: `${origin}${v.previewImage}`
    }));
    const shippingResult = calculateSplitCartShipping(fulfillmentItems, "US");
    const STRIPE_SECRET_KEY = env2.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes("placeholder")) {
      const mockSessionId = `cs_mock_awp_${Date.now()}`;
      return new Response(
        JSON.stringify({
          url: `${origin}/#checkout-success?session_id=${mockSessionId}`,
          sessionId: mockSessionId,
          mock: true,
          splitCartShipping: shippingResult
        }),
        { status: 200, headers: corsHeaders }
      );
    }
    const stripeParams = new URLSearchParams();
    stripeParams.append("payment_method_types[0]", "card");
    stripeParams.append("mode", "payment");
    stripeParams.append("success_url", `${origin}/#checkout-success?session_id={CHECKOUT_SESSION_ID}`);
    stripeParams.append("cancel_url", `${origin}/#checkout-cancel`);
    stripeParams.append("shipping_address_collection[allowed_countries][0]", "US");
    stripeParams.append("shipping_address_collection[allowed_countries][1]", "CA");
    validatedItems.forEach((item, index) => {
      stripeParams.append(`line_items[${index}][price_data][currency]`, "usd");
      stripeParams.append(`line_items[${index}][price_data][product_data][name]`, `${item.artworkTitle} \u2014 ${item.substrateName} (${item.size})`);
      stripeParams.append(`line_items[${index}][price_data][product_data][images][0]`, `${origin}${item.previewImage}`);
      stripeParams.append(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmountCents));
      stripeParams.append(`line_items[${index}][quantity]`, String(item.quantity));
    });
    stripeParams.append("shipping_options[0][shipping_rate_data][type]", "fixed_amount");
    stripeParams.append("shipping_options[0][shipping_rate_data][fixed_amount][amount]", String(shippingResult.totalShippingCents));
    stripeParams.append("shipping_options[0][shipping_rate_data][fixed_amount][currency]", "usd");
    stripeParams.append("shipping_options[0][shipping_rate_data][display_name]", shippingResult.isMultiVendor ? `Split-Facility Shipping (${shippingResult.vendorCount} Specialized Labs)` : "Fine-Art Archival Parcel");
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: stripeParams.toString()
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Stripe API error HTTP ${res.status}: ${err}`);
    }
    const session = await res.json();
    return new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
        splitCartShipping: shippingResult
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error3) {
    const message = error3 instanceof Error ? error3.message : "Checkout session creation failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
__name(onRequestPost, "onRequestPost");

// api/stripe-webhook.ts
async function onRequestPost2(context2) {
  try {
    const { request, env: env2 } = context2;
    const signature = request.headers.get("stripe-signature");
    const rawBody = await request.text();
    const webhookSecret = env2.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid webhook signature." }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    const event = JSON.parse(rawBody);
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const order = {
        sessionId: session.id,
        orderNumber: `AWP-${session.id.slice(-8).toUpperCase()}`,
        recipient: {
          name: session.customer_details?.name || session.shipping_details?.name || "Art Patron",
          email: session.customer_details?.email || "patron@example.com",
          phone: session.customer_details?.phone || "",
          address1: session.shipping_details?.address?.line1 || "",
          address2: session.shipping_details?.address?.line2 || "",
          city: session.shipping_details?.address?.city || "",
          state: session.shipping_details?.address?.state || "",
          postalCode: session.shipping_details?.address?.postal_code || "",
          countryCode: session.shipping_details?.address?.country || "US"
        },
        items: session.metadata?.items ? JSON.parse(session.metadata.items) : [],
        currency: session.currency?.toUpperCase() || "USD"
      };
      console.log(`Routing fulfillment for order: ${order.orderNumber}`);
      const fulfillmentResult = await routeOrder(order, env2);
      return new Response(
        JSON.stringify({
          received: true,
          routed: true,
          fulfillment: fulfillmentResult
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestPost2, "onRequestPost");

// api/subscribe.ts
async function onRequestPost3(context2) {
  try {
    const { request, env: env2 } = context2;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    const body = await request.json();
    const email = body.email ? body.email.trim().toLowerCase() : "";
    const name = body.name ? body.name.trim() : "Collector";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          error: "Please enter a valid email address."
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    const requestUrl = new URL(request.url);
    const origin = requestUrl.origin;
    const wallpaperAustinUrl = `${origin}/downloads/alanwoodyard-austin-dawn-4k.jpg`;
    const wallpaperChesapeakeUrl = `${origin}/downloads/alanwoodyard-chesapeake-mist-4k.jpg`;
    const RESEND_API_KEY = env2.RESEND_API_KEY;
    if (!RESEND_API_KEY || RESEND_API_KEY.includes("placeholder")) {
      console.warn("Resend API key unconfigured; simulating successful 4K wallpaper delivery.");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Welcome package dispatched! Check your inbox for your 4K collector wallpapers.",
          mock: true,
          downloads: {
            austinDawn4k: wallpaperAustinUrl,
            chesapeakeMist4k: wallpaperChesapeakeUrl
          }
        }),
        { status: 200, headers: corsHeaders }
      );
    }
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0b0c10; color: #e0e2ec; padding: 40px 20px; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; background-color: #12131a; border: 1px solid #232533; border-radius: 8px; padding: 36px; }
            .title { font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; margin-bottom: 8px; }
            .subtitle { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #38bdf8; margin-bottom: 24px; }
            .card { background-color: #1a1b26; border: 1px solid #2e3146; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
            .btn { display: inline-block; background-color: #38bdf8; color: #0b0c10; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 4px; margin-top: 12px; }
            .badge { display: inline-block; font-size: 11px; font-weight: 600; background: #222638; color: #94a3b8; padding: 3px 8px; border-radius: 3px; }
            .footer { margin-top: 32px; border-top: 1px solid #232533; padding-top: 20px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="subtitle">Alan Woodyard Fine-Art Photography</div>
            <div class="title">Welcome to the Archive, ${name}</div>
            <p>Thank you for connecting with the studio. As a welcome to the collection, your curated 4K Ultra-HD collector wallpaper package is ready for download.</p>

            <div class="card">
              <div class="badge">4K ULTRA HD // 3840 x 2160</div>
              <h3 style="color: #ffffff; margin: 8px 0 4px 0;">Dawn Shell on Lady Bird Lake</h3>
              <p style="font-size: 13px; color: #94a3b8; margin: 0;">Austin, Texas &bull; ProPhoto RGB &bull; Medium Format</p>
              <a href="${wallpaperAustinUrl}" class="btn">Download 4K Master (Austin)</a>
            </div>

            <div class="card">
              <div class="badge">4K ULTRA HD // 3840 x 2160</div>
              <h3 style="color: #ffffff; margin: 8px 0 4px 0;">Chesapeake Skipjack at Low Mist</h3>
              <p style="font-size: 13px; color: #94a3b8; margin: 0;">Tilghman Island, Maryland &bull; Adobe RGB 1998 &bull; D50 Calibrated</p>
              <a href="${wallpaperChesapeakeUrl}" class="btn">Download 4K Master (Chesapeake)</a>
            </div>

            <div style="background: #1e1b18; border: 1px dashed #d97706; padding: 16px; border-radius: 6px; margin-top: 24px;">
              <div style="color: #f59e0b; font-weight: 600; font-size: 13px; text-transform: uppercase;">Collector Privileges</div>
              <p style="margin: 4px 0 0 0; font-size: 14px;">Use code <strong style="color: #ffffff; font-family: monospace; letter-spacing: 0.05em;">ARCHIVAL15</strong> at checkout for 15% off your first fine-art gicl\xE9e or acrylic float-mount print.</p>
            </div>

            <div class="footer">
              Alan Woodyard Photography &bull; <a href="https://alanwoodyard.photo" style="color: #38bdf8;">alanwoodyard.photo</a><br>
              Direct Fine-Art Proofing: <a href="mailto:printing@alanwoodyard.photo" style="color: #94a3b8;">printing@alanwoodyard.photo</a>
            </div>
          </div>
        </body>
      </html>
    `;
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Alan Woodyard Fine Art <newsletter@alanwoodyard.photo>",
        to: [email],
        subject: "Your 4K Fine-Art Wallpaper Package \u2014 Alan Woodyard Photography",
        html: emailHtml
      })
    });
    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error(`Resend API dispatch failed: HTTP ${resendRes.status}: ${errText}`);
      throw new Error(`Email dispatch failed: ${errText}`);
    }
    const data = await resendRes.json();
    return new Response(
      JSON.stringify({
        success: true,
        message: "Welcome package dispatched! Check your inbox for your 4K collector wallpapers.",
        resendId: data.id
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error3) {
    const message = error3 instanceof Error ? error3.message : "Subscription request failed.";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
__name(onRequestPost3, "onRequestPost");
async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
__name(onRequestOptions, "onRequestOptions");

// ../.wrangler/tmp/pages-m0e0DN/functionsRoutes-0.38341259995619925.mjs
var routes = [
  {
    routePath: "/api/checkout-status",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/create-checkout-session",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/stripe-webhook",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/subscribe",
    mountPath: "/api",
    method: "OPTIONS",
    middlewares: [],
    modules: [onRequestOptions]
  },
  {
    routePath: "/api/subscribe",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  }
];

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count3 = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count3--;
          if (count3 === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count3++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count3)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../Users/woody/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function getOriginalPathPrefix(requestPath, normalizedPrefix) {
  let end = 0;
  for (let index = 0; index < normalizedPrefix.length; index++) {
    end++;
    if (normalizedPrefix[index] === "/") {
      while (requestPath[end] === "/") {
        end++;
      }
    }
  }
  return requestPath.slice(0, end);
}
__name(getOriginalPathPrefix, "getOriginalPathPrefix");
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  const normalizedRequestPath = requestPath.replace(/\/+/g, "/");
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath) || routeMatcher(normalizedRequestPath);
    const originalMountMatch = mountMatcher(requestPath);
    const mountMatchResult = originalMountMatch || mountMatcher(normalizedRequestPath);
    if (matchResult && mountMatchResult) {
      const path = originalMountMatch ? originalMountMatch.path : getOriginalPathPrefix(requestPath, mountMatchResult.path);
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env2, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context2 = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env: env2,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context2);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env2["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error3) {
      if (isFailOpen) {
        const response = await env2["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error3;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
