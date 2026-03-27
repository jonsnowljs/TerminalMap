const MAX_SIZE = 1024 * 1024; // 1MB

export class OutputBuffer {
  private chunks: string[] = [];
  private totalSize = 0;
  private truncated = false;

  append(data: string): void {
    if (this.truncated) return;
    if (this.totalSize + data.length > MAX_SIZE) {
      this.truncated = true;
      return;
    }
    this.chunks.push(data);
    this.totalSize += data.length;
  }

  flush(): string {
    const content = this.chunks.join('');
    const result = this.truncated
      ? content + `\n[truncated: ${this.totalSize} bytes captured, output exceeded 1MB]`
      : content;
    this.chunks = [];
    this.totalSize = 0;
    this.truncated = false;
    return result;
  }

  get size(): number {
    return this.totalSize;
  }
}
