export enum ExitCode {
  Success = 0,
  BlockingFailure = 1,
  ToolOrConfigError = 2,
  InvalidUsage = 64,
  MissingDependency = 69
}
