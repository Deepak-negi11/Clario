import { describe, test, expect, afterEach } from "bun:test";
import { createServer, type AddressInfo } from "node:net";
import { getSmtpConfig, sendWithSmtp, smtpTransportOptions, type SmtpConfig } from "./smtp";

const SMTP_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "EMAIL_FROM"] as const;
const savedEnv = Object.fromEntries(SMTP_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of SMTP_VARS) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

function setSmtpEnv(values: Partial<Record<(typeof SMTP_VARS)[number], string>>) {
  for (const name of SMTP_VARS) delete process.env[name];
  Object.assign(process.env, values);
}

type FakeSmtp = { port: number; commands: string[]; message: () => string; close: () => void };

// Just enough of an SMTP server for nodemailer: it records the commands and the message,
// and can answer one command (EHLO, AUTH, MAIL, RCPT, DATA) with an error instead.
async function startFakeSmtp(fail?: { command: string; reply: string }): Promise<FakeSmtp> {
  const commands: string[] = [];
  let message = "";
  const server = createServer((socket) => {
    let buffer = "";
    let inData = false;
    socket.write("220 fake.test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 Ok: queued\r\n");
          } else {
            message += `${line}\n`;
          }
          continue;
        }
        commands.push(line);
        const verb = line.split(" ")[0]!.toUpperCase();
        if (fail && verb === fail.command) socket.write(`${fail.reply}\r\n`);
        else if (verb === "EHLO") socket.write("250-fake.test\r\n250 AUTH PLAIN\r\n");
        else if (verb === "AUTH") socket.write("235 2.7.0 Authentication successful\r\n");
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (verb === "QUIT") socket.end("221 Bye\r\n");
        else socket.write("250 Ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    commands,
    message: () => message,
    close: () => server.close(),
  };
}

const email = { to: "ana@example.com", subject: "Lunch on Friday?", text: "Hello Ana", replyTo: "sam@example.com" };

function localConfig(port: number): SmtpConfig {
  return { host: "127.0.0.1", port, secure: false, user: "app@example.com", pass: "app-password", from: "Clario <app@example.com>" };
}

describe("getSmtpConfig", () => {
  test("is off until SMTP_HOST is set", () => {
    setSmtpEnv({ SMTP_USER: "me@gmail.com", SMTP_PASS: "x" });
    expect(getSmtpConfig()).toBeNull();
  });

  test("defaults to port 587, STARTTLS and the login as the sender", () => {
    setSmtpEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "me@gmail.com", SMTP_PASS: "abcdefghijklmnop" });
    expect(getSmtpConfig()).toEqual({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      user: "me@gmail.com",
      pass: "abcdefghijklmnop",
      from: "Clario <me@gmail.com>",
    });
  });

  test("uses TLS from the start on port 465, and EMAIL_FROM when set", () => {
    setSmtpEnv({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "me", SMTP_PASS: "x", EMAIL_FROM: "Clario <hi@example.com>" });
    expect(getSmtpConfig()).toMatchObject({ port: 465, secure: true, from: "Clario <hi@example.com>" });
  });

  test("rejects a bad port and a missing sender", () => {
    setSmtpEnv({ SMTP_HOST: "smtp.example.com", SMTP_PORT: "587x", EMAIL_FROM: "a@b.c" });
    expect(getSmtpConfig()).toBeNull();
    setSmtpEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "not-an-address" });
    expect(getSmtpConfig()).toBeNull();
  });
});

describe("smtpTransportOptions", () => {
  test("requires TLS before logging in to a remote server", () => {
    const remote = { host: "smtp.gmail.com", port: 587, secure: false, user: "u", pass: "p", from: "f" };
    expect(smtpTransportOptions(remote)).toMatchObject({ secure: false, requireTLS: true, auth: { user: "u", pass: "p" } });
    expect(smtpTransportOptions({ ...remote, port: 465, secure: true })).toMatchObject({ secure: true, requireTLS: false });
  });

  test("lets a mail catcher on this machine run without TLS", () => {
    expect(smtpTransportOptions(localConfig(1025)).requireTLS).toBe(false);
  });
});

describe("sendWithSmtp", () => {
  test("logs in and sends the email with the sender as Reply-To", async () => {
    const smtp = await startFakeSmtp();
    try {
      const result = await sendWithSmtp(localConfig(smtp.port), email);
      expect(result.ok).toBe(true);

      const auth = smtp.commands.find((line) => line.startsWith("AUTH PLAIN "))!;
      expect(Buffer.from(auth.slice("AUTH PLAIN ".length), "base64").toString()).toBe("\0app@example.com\0app-password");
      expect(smtp.commands).toContain("MAIL FROM:<app@example.com>");
      expect(smtp.commands).toContain("RCPT TO:<ana@example.com>");
      expect(smtp.message()).toContain("From: Clario <app@example.com>");
      expect(smtp.message()).toContain("Reply-To: sam@example.com");
      expect(smtp.message()).toContain("Subject: Lunch on Friday?");
      expect(smtp.message()).toContain("Hello Ana");
    } finally {
      smtp.close();
    }
  });

  test("maps SMTP refusals to a reason", async () => {
    const cases = [
      { command: "AUTH", reply: "535 5.7.8 Username and Password not accepted", reason: "rejected" },
      { command: "RCPT", reply: "550 5.1.1 No such user", reason: "rejected" },
      { command: "MAIL", reply: "421 4.7.0 Try again later", reason: "rate-limited" },
    ];
    for (const { command, reply, reason } of cases) {
      const smtp = await startFakeSmtp({ command, reply });
      try {
        expect(await sendWithSmtp(localConfig(smtp.port), email)).toMatchObject({ ok: false, reason });
      } finally {
        smtp.close();
      }
    }
  });

  test("treats an unreachable server as unavailable", async () => {
    const smtp = await startFakeSmtp();
    smtp.close();
    expect(await sendWithSmtp(localConfig(smtp.port), email)).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
