export class BaseError extends Error {
  public code: string;

  public data?: unknown;

  constructor(code: string, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = this.constructor.name;
  }
}
