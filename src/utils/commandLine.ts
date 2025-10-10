export function quoteArgsForShell(
  args: string[],
  platform: NodeJS.Platform = process.platform
): string[] {
  if (platform !== "win32") {
    return args;
  }

  return args.map((arg) => quoteWindowsArg(arg));
}

function quoteWindowsArg(arg: string): string {
  if (!arg) {
    return '""';
  }

  // Only quote when the argument includes characters that would be
  // interpreted as separators by the Windows shell.
  if (!/[ \t"]/u.test(arg)) {
    return arg;
  }

  // Escape embedded double quotes by doubling them and wrap the value in quotes.
  return `"${arg.replace(/"/gu, '""')}"`;
}
