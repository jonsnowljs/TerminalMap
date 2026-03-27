function sanitizeSnapshotLine(line: string): string {
  return line
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-Z]/g, '')
    .replace(/\[(?:\d+;)*\d*[A-Za-z]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .trim();
}

export function sanitizeTranscript(text: string, limit = 400): string[] {
  return summarizeSnapshotLines(text.replace(/\r/g, '').split('\n'), limit)
}

export function summarizeSnapshotLines(lines: string[], limit = 8): string[] {
  const trimmed = lines.map(sanitizeSnapshotLine);
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') {
    trimmed.pop();
  }

  const visible: string[] = [];
  for (const line of trimmed) {
    if (/^\s*[$%#>]\s*$/.test(line)) {
      continue;
    }

    if (line === '' && visible[visible.length - 1] === '') {
      continue;
    }

    visible.push(line);
  }

  return visible.slice(-limit);
}
