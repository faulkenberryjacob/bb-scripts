import { DEFAULT_LOG_LEVEL } from '@/lib/constants';
import { LogLevel } from './types';

export enum Colors {
  Red =      "\u001b[31m",
  Green =    "\u001b[32m",
  Yellow =   "\u001b[33m",
  Blue =     "\u001b[34m",
  Cyan =     "\u001b[36m",
  Magenta =  "\u001b[35m", 
  None =     ""
}

/**
 * Logger class to handle logging messages with timestamps, caller information, and optional indentation.
 */
export class Logger {
  private ns: NS;
  private isHome: boolean;
  private logLevel: LogLevel;

  constructor(ns: NS, level: LogLevel = DEFAULT_LOG_LEVEL) {
    this.ns = ns;
    this.isHome = this.ns.getHostname() === "home";
    this.logLevel = level;
  }

  info(message: string, indent: number = 0, color: Colors = Colors.None, terminal: boolean = false): void {
    if (this.logLevel < LogLevel.INFO) return;
    const callerInfo = Logger.getCallerInfo();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo} INFO: ${color}${indentation}${message}${color == Colors.None ? "" : `\u001b[0m`}`;
    this.ns.print(formMessage);
    if (terminal) this.ns.tprint(formMessage);
  }

  /**
   * Logs a message with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  warn(message: string, indent: number = 0, terminal: boolean = false): void {
    if (this.logLevel < LogLevel.WARN) return;
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
  error(message: string, indent: number = 0, terminal: boolean = false): void {
    if (this.logLevel < LogLevel.ERROR) return;
    const callerInfo = Logger.getCallerDebug();
    let indentation: string = "";
    for (let i = 0; i < indent; i++) { indentation += "  "; }
    const formMessage = `[${Logger.getTimestampFormat()}] ${callerInfo} ERROR: ${indentation}${message}`;
    this.ns.print(formMessage);
    if (terminal) this.ns.tprint(formMessage);
  }

  /**
   * Logs a message with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  debug(message: string, indent: number = 0, terminal: boolean = false): void {
    if (this.logLevel < LogLevel.DEBUG) return;
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
    this.info(message, indent);
  }

  /**
   * Logs a message to both the game log and the terminal with timestamp, caller information, and optional indentation.
   * @param {string} message - The message to log.
   * @param {number} [indent=0] - The number of indentation levels to apply.
   */
  tlog(message: string, indent: number = 0): void {
    this.info(message, indent, undefined, true);
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