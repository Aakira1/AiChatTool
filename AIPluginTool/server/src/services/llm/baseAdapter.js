export class BaseLlmAdapter {
  async *streamGenerate() {
    throw new Error("streamGenerate() not implemented");
  }
}
