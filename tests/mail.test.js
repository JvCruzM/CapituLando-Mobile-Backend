import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { once } from "node:events";
import { createMailer } from "../src/modules/mail/services/mail-sevice.js";

test("SMTP envia links compatíveis com as páginas do web", async () => {
  const messages = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.write("220 local.test ESMTP\r\n");
    let pending = "";
    let data = null;
    socket.on("data", (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\r\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (data !== null) {
          if (line === ".") {
            messages.push(data.join("\r\n"));
            data = null;
            socket.write("250 queued\r\n");
          } else {
            data.push(line);
          }
        } else if (line.startsWith("EHLO") || line.startsWith("HELO")) {
          socket.write("250 local.test\r\n");
        } else if (line === "DATA") {
          data = [];
          socket.write("354 Send message\r\n");
        } else if (line === "QUIT") {
          socket.end("221 Bye\r\n");
        } else {
          socket.write("250 OK\r\n");
        }
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const mailer = createMailer({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: server.address().port,
      SMTP_SECURE: false,
      MAIL_FROM: "capitulando@example.test",
      FRONTEND_URL: "https://web.example.test",
    });
    await mailer.sendToken(
      "autora@example.test",
      "EMAIL_VERIFICATION",
      "token-de-teste",
    );
    await mailer.sendToken(
      "autora@example.test",
      "PASSWORD_RESET",
      "token-de-reset",
    );
    const plain = messages.map((message) =>
      message.replace(/=\r\n/g, "").replace(/=3D/g, "="),
    );
    assert.match(
      plain[0],
      /https:\/\/web\.example\.test\/confirmar-email\?token=token-de-teste/,
    );
    assert.match(
      plain[1],
      /https:\/\/web\.example\.test\/redefinir-senha\?token=token-de-reset/,
    );
    assert.match(plain[0], /To: autora@example.test/);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});
