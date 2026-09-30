// Errors carry a message code and parameters instead of a message, so that they can be
// printed in the language of the configuration, which may not be loaded yet when the
// error is created.

/** Configuration or environment problem. Exit code 2. */
export class ConfigError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
    this.exitCode = 2;
  }
}

/** Invalid command line. Exit code 2. */
export class UsageError extends ConfigError {}

/** One or more problems in the issues or links. Exit code 1. */
export class ValidationError extends Error {
  /** @param problems array of { code, params } */
  constructor(problems) {
    super("validation failed");
    this.problems = problems;
    this.exitCode = 1;
  }
}
