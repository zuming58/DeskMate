namespace DeskMate.InputBridge;

// Pure policy: tests inject a clock/window/send sink, never touch the desktop.
internal static class DesktopPastePolicy
{
    internal static (bool ok, string reason) Execute(IntPtr expectedWindow, long expiry,
        Func<long> clock, Func<IntPtr> foreground, Func<IntPtr, bool> visible,
        Action<int> wait, Func<(bool ok, string reason)> send)
    {
        var now = clock();
        if (expiry <= now || expiry - now > 3000) return (false, "active-window-output-expired");
        if (expectedWindow == IntPtr.Zero || !visible(expectedWindow)) return (false, "target-window-changed");
        // Finite polling even if the system clock is adjusted while waiting.
        for (var poll = 0; poll <= 30; poll++)
        {
            if (clock() >= expiry) return (false, "active-window-output-expired");
            if (foreground() == expectedWindow && visible(expectedWindow)) return send();
            if (poll < 30) wait(10);
        }
        return (false, "target-window-changed");
    }

    internal static bool RunSelfTest()
    {
        foreach (var scenario in new[] { "same", "changed", "returns", "expired", "expires-waiting", "invalid", "hidden", "send-failed", "clock-stalled" })
        {
            long now = 1000; var waits = 0; var sends = 0;
            var expected = scenario == "invalid" ? IntPtr.Zero : new IntPtr(7);
            var expiry = scenario == "expired" ? 999 : scenario == "expires-waiting" ? 1020 : 3500;
            var result = Execute(expected, expiry, () => now,
                () => new IntPtr(scenario is "same" or "send-failed" || (scenario == "returns" && waits >= 4) ? 7 : 8),
                _ => scenario != "hidden",
                ms => { waits++; if (scenario != "clock-stalled") now += ms; },
                () => { sends++; return scenario == "send-failed" ? (false, "desktop-output-send-input-incomplete") : (true, ""); });
            var shouldSend = scenario is "same" or "returns" or "send-failed";
            if (sends != (shouldSend ? 1 : 0) || result.ok != (scenario is "same" or "returns") || waits > 30) return false;
            if (scenario is "expired" or "expires-waiting" && result.reason != "active-window-output-expired") return false;
        }
        return true;
    }
}
