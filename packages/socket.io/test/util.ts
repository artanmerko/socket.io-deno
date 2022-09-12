import { Server } from "../lib/server.ts";
import * as log from "../../../test_deps.ts";
import { serve } from "../../../test_deps.ts";

function createPartialDone(
  count: number,
  resolve: () => void,
  reject: (reason: string) => void,
) {
  let i = 0;
  return () => {
    if (++i === count) {
      resolve();
    } else if (i > count) {
      reject(`called too many times: ${i} > ${count}`);
    }
  };
}

export function testServeWithAsyncResults(
  server: Server,
  count: number,
  callback: (port: number, partialDone: () => void) => Promise<void> | void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortController = new AbortController();

    serve(server.handler(), {
      onListen: ({ port }) => {
        const partialDone = createPartialDone(count, () => {
          setTimeout(() => {
            // close the server
            abortController.abort();
            server.close();

            setTimeout(resolve, 10);
          }, 10);
        }, reject);

        return callback(port, partialDone);
      },
      signal: abortController.signal,
    });
  });
}

export async function parseSessionID(response: Response): Promise<string> {
  const body = await response.text();
  return JSON.parse(body.substring(1)).sid;
}

export async function runHandshake(
  port: number,
  namespace = "/",
): Promise<string[]> {
  // Engine.IO handshake
  const response = await fetch(
    `http://localhost:${port}/socket.io/?EIO=4&transport=polling`,
    {
      method: "get",
    },
  );

  const sid = await parseSessionID(response);

  // Socket.IO handshake
  await eioPush(port, sid, namespace === "/" ? "40" : `40${namespace},`);
  const body = await eioPoll(port, sid);
  // might be defined if an event is emitted in the "connection" handler
  const firstPacket = body.substring(33); // length of '40{"sid":"xxx"}' + 1 for the separator character

  return [sid, firstPacket];
}

export async function eioPoll(port: number, sid: string) {
  const response = await fetch(
    `http://localhost:${port}/socket.io/?EIO=4&transport=polling&sid=${sid}`,
    {
      method: "get",
    },
  );

  return response.text();
}
export async function eioPush(port: number, sid: string, body: BodyInit) {
  const response = await fetch(
    `http://localhost:${port}/socket.io/?EIO=4&transport=polling&sid=${sid}`,
    {
      method: "post",
      body,
    },
  );

  // consume the response body
  await response.body?.cancel();
}

export function enableLogs() {
  return log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler("DEBUG"),
    },
    loggers: {
      "engine.io": {
        level: "ERROR", // set to "DEBUG" to display the Engine.IO logs
        handlers: ["console"],
      },
      "socket.io": {
        level: "ERROR", // set to "DEBUG" to display the Socket.IO logs
        handlers: ["console"],
      },
    },
  });
}
