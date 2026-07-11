export interface GemmaResponse {
  text: string;
}

export interface GemmaClient {
  generate(opts: { prompt: string; factsJson: string }): Promise<GemmaResponse>;
}

type ClientFactory = () => GemmaClient;
type ProbeFunction = () => Promise<boolean>;

let _factory: ClientFactory | null = null;
let _client: GemmaClient | null = null;

export function registerOnDeviceCandidate(factory: ClientFactory, probe: ProbeFunction): void {
  probe().then((available) => {
    if (available) _factory = factory;
  });
}

export async function getGemmaClient(): Promise<GemmaClient> {
  if (_client) return _client;
  if (_factory) {
    _client = _factory();
    return _client;
  }
  throw new Error("No Gemma client available. On-device model not loaded.");
}
