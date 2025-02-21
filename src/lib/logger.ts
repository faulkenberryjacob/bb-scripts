/**
 * Logger class to handle logging messages with timestamps, caller information, and optional indentation.
 */
export class Logger {
  private ns: NS;
  private isHome: boolean;

  constructor(ns: NS) {
    this.ns = ns;
    this.isHome = this.ns.getHostname() === "home";
  }

  info(message: string, indent: number = 0, terminal: boolean = false): void {
    const callerInfo = Logger.getCallerInfo();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo} INFO: ${indentation}${message}`;
    this.ns.print(formMessage);
    if (terminal) this.ns.tprint(formMessage);
  }

  /**
   * Logs a message with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  warn(message: string, indent: number = 0, terminal: boolean = false): void {
    const callerInfo = Logger.getCallerDebug();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo} WARN: ${indentation}${message}`;
    this.ns.print(formMessage);
    if (terminal) this.ns.tprint(formMessage);
  }

  /**
   * Logs a message with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  error(message: string, indent: number = 0): void {
    const callerInfo = Logger.getCallerDebug();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo} ERROR: ${indentation}${message}`;
    this.ns.print(formMessage);
    this.ns.tprint(formMessage);
  }

  /**
   * Logs a message with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  debug(message: string, indent: number = 0, terminal: boolean = false): void {
    const callerInfo = Logger.getCallerDebug();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo} DEBUG: ${indentation}${message}`;
    this.ns.print(formMessage);
    if (terminal) this.ns.tprint(formMessage);
  }

  /**
   * Logs a message with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  log(message: string, indent: number = 0): void {
    const callerInfo = Logger.getCallerDebug();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo}: ${indentation}${message}`;
    this.ns.print(formMessage);
  }

  /**
   * Logs a message to both the game log and the terminal with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  tlog(message: string, indent: number = 0): void {
    const callerInfo = Logger.getCallerDebug();
        let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo}: ${indentation}${message}`;
    this.ns.print(formMessage);
    this.ns.tprint(formMessage);
  }

  private static getCustomDate(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based, so add 1
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}_${month}_${day}`;
  }

  private static getTimestampFormat(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based, so add 1
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Retrieves caller information such as function name, file path, and line/column numbers.
   * @returns {string} - The caller information string.
   */
  private static getCallerInfo(): string {
    const error = new Error();
    const stack = error.stack?.split("\n");

    if (stack && stack.length > 3) {
      // The 3rd element in the stack trace should be the caller
      const callerLine = stack[3];
      const callerMatch = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/);

      if (callerMatch) {
        const filePath = callerMatch[2];

        return `(${filePath})`;
      }
    }

    return "unknown";
  }

  /**
   * Retrieves caller information such as function name, file path, and line/column numbers.
   * @returns {string} - The caller information string.
   */
  private static getCallerDebug(): string {
    const error = new Error();
    const stack = error.stack?.split("\n");

    if (stack && stack.length > 3) {
      // The 3rd element in the stack trace should be the caller
      const callerLine = stack[3];
      const callerMatch = callerLine.match(/at\s+(.*)\s+\((.*):(\d+):(\d+)\)/);

      if (callerMatch) {
        const functionName = callerMatch[1] || "anonymous";
        const filePath = callerMatch[2];
        const lineNumber = callerMatch[3];
        const columnNumber = callerMatch[4];

        return `${functionName} (${filePath}:${lineNumber})`;
      }
    }

    return "unknown";
  }
}