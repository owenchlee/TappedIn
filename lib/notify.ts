import { spawnSync } from "node:child_process";

/**
 * A Windows toast (bottom-right notification). The text goes in through environment variables, so
 * nothing is ever spliced into the PowerShell command. Silently does nothing off Windows.
 */
export function notify(title: string, body: string) {
  if (process.platform !== "win32") return;
  const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$t = $xml.GetElementsByTagName('text')
$t.Item(0).AppendChild($xml.CreateTextNode($env:TOAST_TITLE)) > $null
$t.Item(1).AppendChild($xml.CreateTextNode($env:TOAST_BODY)) > $null
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))`;
  spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    env: { ...process.env, TOAST_TITLE: title, TOAST_BODY: body },
    windowsHide: true,
    timeout: 15_000,
  });
}
