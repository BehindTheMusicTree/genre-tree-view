import { test as base, expect, type Page, type CDPSession } from "@playwright/test";
import { _android } from "playwright";
import { execFileSync } from "node:child_process";

export { expect };
export const test = base.extend<{ androidPage: Page; cdp: CDPSession }>({
  androidPage: async ({ baseURL }, provide, info) => {
    if (baseURL !== undefined) throw new Error("Android uses its fixed reverse URL; leave baseURL unset");
    const adb = (...args: string[]) => execFileSync("adb", args, { timeout: 15_000, encoding: "utf8" });
    const entries = adb("devices").trim().split("\n").slice(1).filter(Boolean);
    if (entries.length !== 1 || !/\sdevice$/.test(entries[0].trim()))
      throw new Error(`Exactly one ready ADB device is required: ${entries.join(", ")}`);
    const serial = entries[0].split(/\s/)[0];
    const shell = (...args: string[]) => adb("-s", serial, "shell", ...args);
    const chrome = shell("dumpsys", "package", "com.android.chrome").match(/versionName=(\d[^\s]*)/);
    if (!chrome || Number(chrome[1].split(".")[0]) < 105) throw new Error("Chrome >=105 is required on the Android device");
    if (shell("getprop", "sys.boot_completed").trim() !== "1") throw new Error("Android has not completed boot");
    if (!(await fetch("http://127.0.0.1:4173")).ok) throw new Error("Production preview is unavailable on port 4173");
    await info.attach("environment", { body: JSON.stringify({ serial, chrome: chrome[1], fingerprint: shell("getprop", "ro.build.fingerprint").trim(), input: "CDP Input.dispatchTouchEvent (not native OS input)" }), contentType: "application/json" });
    adb("-s", serial, "reverse", "tcp:4173", "tcp:4173");
    let device: Awaited<ReturnType<typeof _android.devices>>[number] | undefined;
    try {
      const devices = await _android.devices();
      device = devices.find((candidate) => candidate.serial() === serial);
      if (!device) throw new Error(`Playwright could not connect to ADB device ${serial}`);
      device.setDefaultTimeout(15_000);
      shell("input", "keyevent", "KEYCODE_WAKEUP");
      shell("wm", "dismiss-keyguard");
      shell("am", "force-stop", "com.android.chrome");
      const cleared = shell("pm", "clear", "com.android.chrome");
      if (!cleared.includes("Success")) throw new Error(`Could not clear Chrome state: ${cleared}`);
      const context = await device.launchBrowser({ args: ["--no-first-run"] });
      const errors: string[] = [];
      try {
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        try { await provide(page); }
        finally {
          await info.attach("console-errors", { body: JSON.stringify(errors), contentType: "application/json" });
          if (info.status !== info.expectedStatus) {
            await page.screenshot({ path: info.outputPath("failure.png") }).catch(() => {});
          }
          await context.tracing.stop({ path: info.outputPath("trace.zip") });
        }
      } finally { await context.close(); }
    } finally {
      try { await device?.close(); }
      finally { adb("-s", serial, "reverse", "--remove", "tcp:4173"); }
    }
  },
  cdp: async ({ androidPage }, provide) => {
    const session = await androidPage.context().newCDPSession(androidPage);
    try { await provide(session); } finally { await session.detach(); }
  },
});
