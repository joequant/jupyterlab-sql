import { URLExt } from '@jupyterlab/coreutils';

import { ServerConnection } from '@jupyterlab/services';

export namespace Server {
  export async function makeRequest(
    endpoint: string,
    request: RequestInit
  ): Promise<Response> {
    const settings = ServerConnection.makeSettings();
    const url = URLExt.join(settings.baseUrl, endpoint);
    return await ServerConnection.makeRequest(url, request, settings);
  }
}
