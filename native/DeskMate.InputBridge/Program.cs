using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Win32.SafeHandles;

namespace DeskMate.InputBridge;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        if (args.Contains("--protocol-self-test", StringComparer.OrdinalIgnoreCase))
        {
            Environment.ExitCode = VendorReportProtocol.RunSelfTest() ? 0 : 1;
            return;
        }
        var writer = new EventWriter();
        if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
        {
            writer.Input("easyinput-hid", "F22", "down");
            writer.Input("easyinput-hid", "F22", "up");
            writer.HostAction("00000000-0000-0000-0000-000000000001");
            writer.FixedTextReady("fixed-00000000000000000000000000000000", 12);
            writer.ConfigAck(true, true, 120, 0x1234, 2);
            writer.Status(false);
            return;
        }

        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        using var commands = new ConfigCommandListener(writer);
        using var window = new RawInputWindow(writer, args.Contains("--diagnose", StringComparer.OrdinalIgnoreCase));
        commands.Start();
        Application.Run();
    }
}

internal sealed class EventWriter
{
    private readonly object _sync = new();
    private long _sequence;

    public void Input(string source, string key, string action) => Write(new BridgeEvent(
        1, "input", source, key, action, DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null));

    public void Status(bool connected) => Write(new BridgeEvent(
        1, "status", "easyinput-hid", "Device", connected ? "connected" : "disconnected",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), connected));

    public void HostAction(string id) => Write(new BridgeEvent(
        1, "host-action", "easyinput-hid", "HostAction", "invoke",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null, hostActionId: id));

    public void FixedTextReady(string requestId, int bytes) => Write(new BridgeEvent(
        1, "fixed-text", "easyinput-hid", "FixedText", "ready",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null, requestId: requestId, bytes: bytes));

    public void FixedTextResult(string requestId, bool ok, string reason, int bytes) => Write(new BridgeEvent(
        1, "fixed-text-result", "easyinput-hid", "FixedText", ok ? "injected" : "failed",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null, requestId: requestId,
        ok: ok, reason: reason, bytes: bytes));

    public void DesktopOutputResult(string requestId, bool ok, string reason) => Write(new BridgeEvent(
        1, "desktop-output-result", "desktop-output", "ActiveWindow", ok ? "pasted" : "failed",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null, requestId: requestId,
        ok: ok, reason: reason));

    public void DesktopWindowResult(string requestId, bool ok, string reason, string targetWindow) => Write(new BridgeEvent(
        1, "desktop-window-result", "desktop-output", "ActiveWindow", ok ? "captured" : "failed",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null, requestId: requestId,
        ok: ok, reason: reason, targetWindow: targetWindow));

    public void ConfigWrite(string requestId, bool ok, string reason = "") => Write(new BridgeEvent(
        1, "config-write", "easyinput-hid", "Config", ok ? "written" : "failed",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        requestId: requestId, ok: ok, reason: reason));

    public void AgentStateWrite(string requestId, bool ok, string reason = "") => Write(new BridgeEvent(
        1, "agent-state-write", "easyinput-hid", "AgentState", ok ? "written" : "failed",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        requestId: requestId, ok: ok, reason: reason));

    public void ManualCalibrationWrite(string requestId, bool ok, string reason = "") => Write(new BridgeEvent(
        1, "manual-calibration-write", "easyinput-hid", "ManualCalibration", ok ? "written" : "failed",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        requestId: requestId, ok: ok, reason: reason));

    public void ManualCalibrationReport(ReadOnlySpan<byte> report) => Write(new BridgeEvent(
        1, "manual-calibration-report", "easyinput-hid", "ManualCalibration", "report",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        reportBase64: Convert.ToBase64String(report)));

    public void ConfigAck(bool ok, bool saved, int bytes, int crc16, int phase) => Write(new BridgeEvent(
        1, "config-ack", "easyinput-hid", "Config", ok ? "accepted" : "rejected",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        ok: ok, saved: saved, bytes: bytes, crc16: crc16, phase: phase));

    public void ConfigSnapshot(string requestId, int bytes, int crc16, int source, string jsonBase64) => Write(new BridgeEvent(
        1, "config-snapshot", "easyinput-hid", "Config", "snapshot",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        requestId: requestId, bytes: bytes, crc16: crc16, sourceId: source, jsonBase64: jsonBase64));

    public void ConfigProgress(string requestId, int chunk, int total) => Write(new BridgeEvent(
        1, "config-progress", "easyinput-hid", "Config", "progress",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        requestId: requestId, chunk: chunk, total: total));

    public void ConfigCapabilities(
        string requestId, bool read, bool write, bool hostAction, bool fixedText,
        bool deskMateLink, bool agentStateBridge, string linkState,
        uint linkRxFrames, uint linkTxFrames, uint linkRequestTimeouts,
        uint linkRetries, uint linkPeerRestarts,
        uint agentAccepted, uint agentMalformed, uint agentDroppedDisconnected,
        uint agentForwarded, uint agentQueueDrops) => Write(new BridgeEvent(
        1, "config-capabilities", "easyinput-hid", "Config", "capabilities",
        DateTimeOffset.UtcNow, Interlocked.Increment(ref _sequence), null,
        requestId: requestId, configReadV1: read, configWriteV1: write,
        hostActionV1: hostAction, fixedTextV1: fixedText,
        deskMateLinkV1: deskMateLink, agentStateBridgeV1: agentStateBridge,
        linkState: linkState, linkRxFrames: linkRxFrames,
        linkTxFrames: linkTxFrames, linkRequestTimeouts: linkRequestTimeouts,
        linkRetries: linkRetries, linkPeerRestarts: linkPeerRestarts,
        agentAccepted: agentAccepted, agentMalformed: agentMalformed,
        agentDroppedDisconnected: agentDroppedDisconnected,
        agentForwarded: agentForwarded, agentQueueDrops: agentQueueDrops));

    private void Write(BridgeEvent value)
    {
        lock (_sync)
        {
            Console.Out.WriteLine(JsonSerializer.Serialize(value, BridgeJsonContext.Default.BridgeEvent));
            Console.Out.Flush();
        }
    }
}

internal sealed record BridgeEvent(
    int version,
    string type,
    string source,
    string key,
    string action,
    DateTimeOffset time,
    long sequence,
    bool? boardConnected,
    string? hostActionId = null,
    string? requestId = null,
    bool? ok = null,
    string? reason = null,
    bool? saved = null,
    int? bytes = null,
    int? crc16 = null,
    int? phase = null,
    int? sourceId = null,
    string? jsonBase64 = null,
    int? chunk = null,
    int? total = null,
    bool? configReadV1 = null,
    bool? configWriteV1 = null,
    bool? hostActionV1 = null,
    bool? fixedTextV1 = null,
    bool? deskMateLinkV1 = null,
    bool? agentStateBridgeV1 = null,
    string? linkState = null,
    uint? linkRxFrames = null,
    uint? linkTxFrames = null,
    uint? linkRequestTimeouts = null,
    uint? linkRetries = null,
    uint? linkPeerRestarts = null,
    uint? agentAccepted = null,
    uint? agentMalformed = null,
    uint? agentDroppedDisconnected = null,
    uint? agentForwarded = null,
    uint? agentQueueDrops = null,
    string? targetWindow = null,
    string? reportBase64 = null);

[System.Text.Json.Serialization.JsonSerializable(typeof(BridgeEvent))]
internal partial class BridgeJsonContext : System.Text.Json.Serialization.JsonSerializerContext;

internal sealed class ConfigCommandListener : IDisposable
{
    private readonly EventWriter _writer;
    private readonly CancellationTokenSource _cancellation = new();

    public ConfigCommandListener(EventWriter writer) => _writer = writer;

    public void Start() => _ = Task.Run(ReadCommands);

    private async Task ReadCommands()
    {
        while (!_cancellation.IsCancellationRequested)
        {
            var line = await Console.In.ReadLineAsync(_cancellation.Token).ConfigureAwait(false);
            if (line is null) return;
            await Handle(line).ConfigureAwait(false);
        }
    }

    private Task Handle(string line)
    {
        string requestId = "invalid-request";
        string commandType = "";
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (!root.TryGetProperty("version", out var version) || version.GetInt32() != 1 ||
                !root.TryGetProperty("type", out var type) ||
                (type.GetString() != "sync-config" && type.GetString() != "read-config" && type.GetString() != "inject-fixed-text" && type.GetString() != "paste-active-window" && type.GetString() != "capture-active-window" && type.GetString() != "set-agent-state" && type.GetString() != "manual-calibration-request") ||
                !root.TryGetProperty("requestId", out var request) ||
                !IsRequestId(request.GetString())) throw new InvalidOperationException("invalid-command");
            requestId = request.GetString()!;
            commandType = type.GetString()!;
            if (commandType == "manual-calibration-request")
            {
                if (!root.TryGetProperty("report", out var reportValue)) throw new InvalidOperationException("invalid-manual-calibration-report");
                var report = Convert.FromBase64String(reportValue.GetString() ?? "");
                if (!VendorReportProtocol.IsValidManualCalibrationRequest(report)) throw new InvalidOperationException("invalid-manual-calibration-report");
                var manualResult = HidFeatureDevice.WriteManualCalibrationRequest(report);
                _writer.ManualCalibrationWrite(requestId, manualResult.ok, manualResult.reason);
                return Task.CompletedTask;
            }
            if (commandType == "set-agent-state")
            {
                if (!root.TryGetProperty("report", out var reportValue)) throw new InvalidOperationException("invalid-agent-state-report");
                var report = Convert.FromBase64String(reportValue.GetString() ?? "");
                if (!VendorReportProtocol.IsValidAgentStateReport(report)) throw new InvalidOperationException("invalid-agent-state-report");
                var agentResult = HidFeatureDevice.WriteAgentStateReport(report);
                _writer.AgentStateWrite(requestId, agentResult.ok, agentResult.reason);
                return Task.CompletedTask;
            }
            if (commandType == "capture-active-window")
            {
                var capture = RawInputWindow.CaptureActiveWindow();
                _writer.DesktopWindowResult(requestId, capture.ok, capture.reason, capture.targetWindow);
                return Task.CompletedTask;
            }
            if (commandType == "paste-active-window")
            {
                if (!root.TryGetProperty("targetWindow", out var targetValue) || !ulong.TryParse(targetValue.GetString(), out var target) || target == 0)
                    throw new InvalidOperationException("invalid-active-window-command");
                var output = RawInputWindow.PasteActiveWindow(new IntPtr(unchecked((long)target)));
                _writer.DesktopOutputResult(requestId, output.ok, output.reason);
                return Task.CompletedTask;
            }
            if (commandType == "inject-fixed-text")
            {
                if (!root.TryGetProperty("expiresUnixMs", out var expiryValue) || !expiryValue.TryGetInt64(out var expiry) ||
                    !root.TryGetProperty("blockedProcessId", out var processValue) || !processValue.TryGetUInt32(out var blockedProcessId) ||
                    !root.TryGetProperty("blockedWindowHandles", out var windowsValue) || windowsValue.ValueKind != JsonValueKind.Array || windowsValue.GetArrayLength() > 4)
                    throw new InvalidOperationException("invalid-fixed-text-command");
                var blockedWindows = new HashSet<IntPtr>();
                foreach (var item in windowsValue.EnumerateArray())
                {
                    if (!ulong.TryParse(item.GetString(), out var handle)) throw new InvalidOperationException("invalid-fixed-text-command");
                    blockedWindows.Add(new IntPtr(unchecked((long)handle)));
                }
                var injection = RawInputWindow.InjectFixedText(requestId, expiry, blockedProcessId, blockedWindows);
                _writer.FixedTextResult(requestId, injection.ok, injection.reason, injection.bytes);
                return Task.CompletedTask;
            }
            if (commandType == "read-config") {
                if (!root.TryGetProperty("report", out var reportValue)) throw new InvalidOperationException("invalid-report");
                var report = Convert.FromBase64String(reportValue.GetString() ?? "");
                if (report.Length != 64 || report[0] != 0x13 || report[1] != (byte)'S' || report[2] != (byte)'3' || report[3] != (byte)'R' || report[4] != 1 || report[9] > 2 || report.AsSpan(10).ContainsAnyExcept((byte)0)) throw new InvalidOperationException("invalid-read-report");
                // Register the request before issuing the feature report. HID
                // devices may answer synchronously on the first transfer.
                RawInputWindow.BeginRead(requestId, BitConverter.ToUInt32(report, 5), report[9]);
                var readAccepted = HidFeatureDevice.RequestConfigRead(report);
                if (!readAccepted) { RawInputWindow.CancelRead(requestId); _writer.ConfigWrite(requestId, false, "config-read-request-failed"); return Task.CompletedTask; }
                return Task.CompletedTask;
            }
            if (commandType != "sync-config") throw new InvalidOperationException("invalid-command");
            if (!root.TryGetProperty("reports", out var reportsValue) || reportsValue.ValueKind != JsonValueKind.Array || reportsValue.GetArrayLength() is < 1 or > 40)
                throw new InvalidOperationException("invalid-reports");
            var reports = new List<byte[]>();
            foreach (var item in reportsValue.EnumerateArray())
            {
                var report = Convert.FromBase64String(item.GetString() ?? "");
                if (!IsConfigReport(report)) throw new InvalidOperationException("invalid-config-report");
                reports.Add(report);
            }
            var result = HidFeatureDevice.WriteConfigReports(reports);
            _writer.ConfigWrite(requestId, result.ok, result.reason);
        }
        catch (Exception error) when (error is JsonException or FormatException or InvalidOperationException)
        {
            var reason = error.Message.Length <= 80 ? error.Message : "invalid-command";
            if (commandType == "set-agent-state") _writer.AgentStateWrite(requestId, false, reason);
            else if (commandType == "manual-calibration-request") _writer.ManualCalibrationWrite(requestId, false, reason);
            else _writer.ConfigWrite(requestId, false, reason);
        }
        return Task.CompletedTask;
    }

    private static bool IsRequestId(string? value) => value is { Length: >= 8 and <= 80 } && value.All(character => char.IsAsciiLetterOrDigit(character) || character == '-');

    private static bool IsConfigReport(byte[] report)
    {
        if (report.Length != 64 || report[0] != 0x10 || report[1] != (byte)'S' || report[2] != (byte)'3' || report[3] != (byte)'C' || report[4] != 1) return false;
        var chunkBytes = report[9];
        return chunkBytes is >= 1 and <= 52 && report.AsSpan(12 + chunkBytes).ContainsAnyExcept((byte)0) == false;
    }

    public void Dispose() => _cancellation.Cancel();
}

internal static class HidFeatureDevice
{
    private const uint DigcfPresent = 0x00000002;
    private const uint DigcfDeviceInterface = 0x00000010;
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint FileShareRead = 0x00000001;
    private const uint FileShareWrite = 0x00000002;
    private const uint OpenExisting = 3;
    private const ushort VendorId = 0x303A;
    private const ushort ProductId = 0x1006;
    private const int HidpStatusSuccess = 0x00110000;

    public static (bool ok, string reason) WriteConfigReports(IReadOnlyList<byte[]> reports)
    {
        using var handle = OpenConfigInterface();
        if (handle is null || handle.IsInvalid) return (false, "compatible-vendor-hid-not-found");
        foreach (var report in reports)
        {
            if (report.Length != 64 || report[0] != 0x10) return (false, "invalid-config-report");
            if (!HidD_SetFeature(handle, report, report.Length)) return (false, $"hid-set-feature-{Marshal.GetLastWin32Error()}");
            Thread.Sleep(12);
        }
        return (true, "");
    }

    public static bool RequestConfigRead(byte[] report)
    {
        using var handle = OpenConfigInterface();
        return handle is not null && !handle.IsInvalid && HidD_SetFeature(handle, report, report.Length);
    }

    public static (bool ok, string reason) WriteAgentStateReport(byte[] report)
    {
        if (!VendorReportProtocol.IsValidAgentStateReport(report)) return (false, "invalid-agent-state-report");
        using var handle = OpenConfigInterface();
        if (handle is null || handle.IsInvalid) return (false, "compatible-vendor-hid-not-found");
        return HidD_SetFeature(handle, report, report.Length)
            ? (true, "")
            : (false, $"hid-set-feature-{Marshal.GetLastWin32Error()}");
    }

    public static (bool ok, string reason) WriteManualCalibrationRequest(byte[] report)
    {
        if (!VendorReportProtocol.IsValidManualCalibrationRequest(report)) return (false, "invalid-manual-calibration-report");
        using var handle = OpenConfigInterface();
        if (handle is null || handle.IsInvalid) return (false, "compatible-vendor-hid-not-found");
        return HidD_SetFeature(handle, report, report.Length)
            ? (true, "")
            : (false, $"hid-set-feature-{Marshal.GetLastWin32Error()}");
    }

    private static SafeFileHandle? OpenConfigInterface()
    {
        HidD_GetHidGuid(out var hidGuid);
        var info = SetupDiGetClassDevs(ref hidGuid, null, IntPtr.Zero, DigcfPresent | DigcfDeviceInterface);
        if (info == new IntPtr(-1)) return null;
        try
        {
            for (uint index = 0; ; index++)
            {
                var interfaceData = new DeviceInterfaceData { Size = Marshal.SizeOf<DeviceInterfaceData>() };
                if (!SetupDiEnumDeviceInterfaces(info, IntPtr.Zero, ref hidGuid, index, ref interfaceData)) break;
                SetupDiGetDeviceInterfaceDetail(info, ref interfaceData, IntPtr.Zero, 0, out var required, IntPtr.Zero);
                if (required == 0) continue;
                var detail = Marshal.AllocHGlobal((int)required);
                try
                {
                    Marshal.WriteInt32(detail, IntPtr.Size == 8 ? 8 : 6);
                    if (!SetupDiGetDeviceInterfaceDetail(info, ref interfaceData, detail, required, out _, IntPtr.Zero)) continue;
                    var devicePath = Marshal.PtrToStringUni(IntPtr.Add(detail, 4));
                    if (string.IsNullOrWhiteSpace(devicePath)) continue;
                    var handle = CreateFile(devicePath, GenericRead | GenericWrite, FileShareRead | FileShareWrite, IntPtr.Zero, OpenExisting, 0, IntPtr.Zero);
                    if (handle.IsInvalid) { handle.Dispose(); continue; }
                    if (MatchesConfigContract(handle)) return handle;
                    handle.Dispose();
                }
                finally { Marshal.FreeHGlobal(detail); }
            }
        }
        finally { SetupDiDestroyDeviceInfoList(info); }
        return null;
    }

    private static bool MatchesConfigContract(SafeFileHandle handle)
    {
        var attributes = new HidAttributes { Size = Marshal.SizeOf<HidAttributes>() };
        if (!HidD_GetAttributes(handle, ref attributes) || attributes.VendorId != VendorId || attributes.ProductId != ProductId) return false;
        if (!HidD_GetPreparsedData(handle, out var preparsed)) return false;
        try
        {
            return HidP_GetCaps(preparsed, out var capabilities) == HidpStatusSuccess && capabilities.FeatureReportByteLength >= 64 && capabilities.InputReportByteLength >= 64;
        }
        finally { HidD_FreePreparsedData(preparsed); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DeviceInterfaceData { public int Size; public Guid InterfaceClassGuid; public int Flags; public UIntPtr Reserved; }

    [StructLayout(LayoutKind.Sequential)]
    private struct HidAttributes { public int Size; public ushort VendorId; public ushort ProductId; public ushort VersionNumber; }

    [StructLayout(LayoutKind.Sequential)]
    private struct HidCapabilities
    {
        public ushort Usage;
        public ushort UsagePage;
        public ushort InputReportByteLength;
        public ushort OutputReportByteLength;
        public ushort FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
        public ushort NumberLinkCollectionNodes;
        public ushort NumberInputButtonCaps;
        public ushort NumberInputValueCaps;
        public ushort NumberInputDataIndices;
        public ushort NumberOutputButtonCaps;
        public ushort NumberOutputValueCaps;
        public ushort NumberOutputDataIndices;
        public ushort NumberFeatureButtonCaps;
        public ushort NumberFeatureValueCaps;
        public ushort NumberFeatureDataIndices;
    }

    [DllImport("hid.dll")]
    private static extern void HidD_GetHidGuid(out Guid guid);

    [DllImport("hid.dll", SetLastError = true)]
    private static extern bool HidD_SetFeature(SafeFileHandle handle, byte[] reportBuffer, int reportBufferLength);

    [DllImport("hid.dll", SetLastError = true)]
    private static extern bool HidD_GetAttributes(SafeFileHandle handle, ref HidAttributes attributes);

    [DllImport("hid.dll", SetLastError = true)]
    private static extern bool HidD_GetPreparsedData(SafeFileHandle handle, out IntPtr preparsedData);

    [DllImport("hid.dll", SetLastError = true)]
    private static extern bool HidD_FreePreparsedData(IntPtr preparsedData);

    [DllImport("hid.dll")]
    private static extern int HidP_GetCaps(IntPtr preparsedData, out HidCapabilities capabilities);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr SetupDiGetClassDevs(ref Guid classGuid, string? enumerator, IntPtr parent, uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiEnumDeviceInterfaces(IntPtr deviceInfo, IntPtr device, ref Guid classGuid, uint index, ref DeviceInterfaceData interfaceData);

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr deviceInfo, ref DeviceInterfaceData interfaceData, IntPtr detailData, uint detailSize, out uint requiredSize, IntPtr deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfo);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string fileName, uint access, uint share, IntPtr securityAttributes, uint creationDisposition, uint flags, IntPtr template);
}

internal sealed class RawInputWindow : NativeWindow, IDisposable
{
    private static RawInputWindow? Current;
    public static void BeginRead(string requestId, uint numericRequest, byte flag) => Current?.BeginReadInternal(requestId, numericRequest, flag);
    public static void CancelRead(string requestId) => Current?.CancelReadInternal(requestId);
    public static (bool ok, string reason, int bytes) InjectFixedText(string requestId, long expiresUnixMs, uint blockedProcessId, IReadOnlySet<IntPtr> blockedWindows) =>
        Current?.InjectFixedTextInternal(requestId, expiresUnixMs, blockedProcessId, blockedWindows) ?? (false, "input-window-unavailable", 0);
    public static (bool ok, string reason) PasteActiveWindow(IntPtr expectedWindow) =>
        Current?.PasteActiveWindowInternal(expectedWindow) ?? (false, "input-window-unavailable");
    public static (bool ok, string reason, string targetWindow) CaptureActiveWindow() =>
        Current?.CaptureActiveWindowInternal() ?? (false, "input-window-unavailable", string.Empty);
    private const int WmInput = 0x00FF;
    private const int WmInputDeviceChange = 0x00FE;
    private const uint RidInput = 0x10000003;
    private const uint RidiDeviceName = 0x20000007;
    private const uint RimTypeKeyboard = 1;
    private const uint RimTypeHid = 2;
    private const ushort HidUsagePageGeneric = 0x01;
    private const ushort HidUsageGenericKeyboard = 0x06;
    private const ushort HidUsagePageVendor = 0xFF00;
    private const ushort HidUsageVendorCommands = 0x02;
    private const uint RidevInputSink = 0x00000100;
    private const uint RidevDeviceNotify = 0x00002000;
    private const ushort RiKeyBreak = 0x0001;
    private const ushort RiKeyE0 = 0x0002;
    private const ushort VkMenu = 0x12;
    private const ushort VkEscape = 0x1B;
    private const ushort VkRMenu = 0xA5;
    private const ushort VkControl = 0x11;
    private const ushort VkLControl = 0xA2;
    private const ushort VkRControl = 0xA3;
    private const ushort VkShift = 0x10;
    private const ushort VkLShift = 0xA0;
    private const ushort VkRShift = 0xA1;
    private const ushort VkE = 0x45;
    private const ushort VkSpace = 0x20;
    private const ushort VkV = 0x56;
    private const ushort VkF22 = 0x85;
    private const int WhKeyboardLl = 13;
    private const int WmKeyDown = 0x0100;
    private const int WmKeyUp = 0x0101;
    private const int WmSysKeyDown = 0x0104;
    private const int WmSysKeyUp = 0x0105;
    private const string BoardVidPid = "VID_303A&PID_1006";

    private readonly EventWriter _writer;
    private readonly bool _diagnosticMode;
    private readonly LowLevelKeyboardProc _keyboardProc;
    private IntPtr _keyboardHook;
    private bool _boardConnected;
    private bool _hookControlDown;
    private bool _hookShiftDown;
    private bool _hookVoiceEditDown;
    private bool _boardControlDown;
    private bool _boardShiftDown;
    private bool _boardVoiceInputDown;
    private bool _boardVoiceEditDown;
    private bool _disposed;
    private readonly object _configSync = new();
    private readonly object _fixedTextSync = new();
    private readonly FixedTextAssembler _fixedTextAssembler = new();
    private PendingFixedText? _pendingFixedText;
    private string? _pendingReadRequest;
    private uint _pendingReadNumericRequest;
    private byte _pendingReadFlag;
    private readonly List<byte[]> _configChunks = new();
    private int _configTotal;
    private int _configLength;
    private int _configCrc16;
    private int _configSource;
    private int _configNextChunk;
    private uint _configNumericRequest;
    private byte[]? _configLastChunk;

    public RawInputWindow(EventWriter writer, bool diagnosticMode = false)
    {
        _writer = writer;
        Current = this;
        _diagnosticMode = diagnosticMode;
        _keyboardProc = KeyboardHook;
        CreateHandle(new CreateParams { Caption = "DeskMate Raw Input Bridge", Parent = new IntPtr(-3) });
        RegisterKeyboard();
        _keyboardHook = SetWindowsHookEx(WhKeyboardLl, _keyboardProc, GetModuleHandle(null), 0);
        RefreshBoardStatus(force: true);
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmInput) ReadInput(m.LParam);
        else if (m.Msg == WmInputDeviceChange) RefreshBoardStatus(force: false);
        base.WndProc(ref m);
    }

    private void RegisterKeyboard()
    {
        var devices = new[]
        {
            new RawInputDevice
            {
                UsagePage = HidUsagePageGeneric,
                Usage = HidUsageGenericKeyboard,
                Flags = RidevInputSink | RidevDeviceNotify,
                Target = Handle,
            },
            new RawInputDevice
            {
                UsagePage = HidUsagePageVendor,
                Usage = HidUsageVendorCommands,
                Flags = RidevInputSink | RidevDeviceNotify,
                Target = Handle,
            },
        };
        if (!RegisterRawInputDevices(devices, (uint)devices.Length, (uint)Marshal.SizeOf<RawInputDevice>()))
            throw new InvalidOperationException($"Raw Input registration failed: {Marshal.GetLastWin32Error()}");
    }

    private void ReadInput(IntPtr inputHandle)
    {
        uint size = 0;
        var headerSize = (uint)Marshal.SizeOf<RawInputHeader>();
        if (GetRawInputData(inputHandle, RidInput, IntPtr.Zero, ref size, headerSize) != 0 || size < headerSize) return;
        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (GetRawInputData(inputHandle, RidInput, buffer, ref size, headerSize) != size) return;
            var header = Marshal.PtrToStructure<RawInputHeader>(buffer);
            var name = GetDeviceName(header.Device);
            var board = name.Contains(BoardVidPid, StringComparison.OrdinalIgnoreCase);
            if (header.Type == RimTypeHid && board) ReadVendorReports(buffer, headerSize, size);
            if (header.Type != RimTypeKeyboard) return;
            var keyboard = Marshal.PtrToStructure<RawKeyboard>(IntPtr.Add(buffer, (int)headerSize));
            var isUp = (keyboard.Flags & RiKeyBreak) != 0;
            var action = isUp ? "up" : "down";

            if (board) HandleBoardVoiceShortcut(keyboard.VKey, isUp);

            if (_diagnosticMode)
                _writer.Input(board ? "easyinput-hid" : "other-keyboard", keyboard.VKey == VkF22 ? "F22" : $"VK_0x{keyboard.VKey:X2}_SCAN_0x{keyboard.MakeCode:X2}", action);
            else if (board && keyboard.VKey == VkF22)
                _writer.Input("easyinput-hid", "F22", action);
            else if (keyboard.VKey == VkRMenu || (keyboard.VKey == VkMenu && (keyboard.Flags & RiKeyE0) != 0))
                _writer.Input("keyboard", "RightAlt", action);
            else if (keyboard.VKey == VkEscape)
                _writer.Input("keyboard", "Escape", action);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private void HandleBoardVoiceShortcut(ushort virtualKey, bool isUp)
    {
        var isDown = !isUp;
        if (virtualKey is VkControl or VkLControl or VkRControl)
        {
            _boardControlDown = isDown;
            return;
        }
        if (virtualKey is VkShift or VkLShift or VkRShift)
        {
            _boardShiftDown = isDown;
            return;
        }
        if (virtualKey == VkSpace)
        {
            if (isDown && _boardControlDown && _boardShiftDown && !_boardVoiceInputDown)
            {
                _boardVoiceInputDown = true;
                _writer.Input("easyinput-hid", "VoiceInput", "down");
            }
            else if (isUp && _boardVoiceInputDown)
            {
                _boardVoiceInputDown = false;
                _writer.Input("easyinput-hid", "VoiceInput", "up");
            }
            return;
        }
        if (virtualKey == VkE)
        {
            if (isDown && _boardControlDown && _boardShiftDown && !_boardVoiceEditDown)
            {
                _boardVoiceEditDown = true;
                _writer.Input("easyinput-hid", "VoiceEdit", "down");
            }
            else if (isUp && _boardVoiceEditDown)
            {
                _boardVoiceEditDown = false;
                _writer.Input("easyinput-hid", "VoiceEdit", "up");
            }
        }
    }

    private void ReadVendorReports(IntPtr buffer, uint headerSize, uint totalSize)
    {
        var rawHid = Marshal.PtrToStructure<RawHidHeader>(IntPtr.Add(buffer, (int)headerSize));
        if (rawHid.SizeHid is 0 or > 256 || rawHid.Count is 0 or > 32) return;
        var dataOffset = checked((int)headerSize + Marshal.SizeOf<RawHidHeader>());
        var byteCount = checked((int)(rawHid.SizeHid * rawHid.Count));
        if (dataOffset + byteCount > totalSize) return;
        var data = new byte[byteCount];
        Marshal.Copy(IntPtr.Add(buffer, dataOffset), data, 0, byteCount);
        for (var index = 0; index < rawHid.Count; index++)
        {
            var offset = checked((int)(index * rawHid.SizeHid));
            ParseVendorReport(data.AsSpan(offset, (int)rawHid.SizeHid));
        }
    }

    private void ParseVendorReport(ReadOnlySpan<byte> report)
    {
        if (report.Length == 64 && report[0] == 0x17)
        {
            if (VendorReportProtocol.IsValidManualCalibrationResponse(report)) _writer.ManualCalibrationReport(report);
            return;
        }
        if (!VendorReportProtocol.HasValidEnvelope(report)) return;
        var kind = report[1];
        var length = report[4];
        if (kind == 0x05 && length == 36)
        {
            var id = Encoding.ASCII.GetString(report.Slice(5, 36));
            if (IsCanonicalUuid(id)) _writer.HostAction(id);
        }
        else if (kind == 0x01)
        {
            lock (_fixedTextSync)
            {
                if (_pendingFixedText is not null && DateTimeOffset.UtcNow > _pendingFixedText.Expires) _pendingFixedText = null;
                if (!_fixedTextAssembler.Accept(report, out var payload) || payload.Bytes == 0 || _pendingFixedText is not null) return;
                var requestId = $"fixed-{Guid.NewGuid():N}";
                _pendingFixedText = new PendingFixedText(requestId, payload.Text, payload.Bytes, DateTimeOffset.UtcNow.AddSeconds(3));
                _writer.FixedTextReady(requestId, payload.Bytes);
            }
        }
        else if (kind == 0x03 && length == 7)
        {
            var bytes = report[7] | (report[8] << 8);
            var crc16 = report[9] | (report[10] << 8);
            _writer.ConfigAck(report[6] == 1, report[11] == 1, bytes, crc16, report[5]);
        }
        else if ((kind == 0x06 || kind == 0x04) && _pendingReadRequest is not null)
        {
            ParseConfigStream(report, kind, length);
        }
    }

    private void BeginReadInternal(string requestId, uint numericRequest, byte flag)
    {
        lock (_configSync)
        {
            ResetConfigReadLocked();
            _pendingReadRequest = requestId;
            _pendingReadNumericRequest = numericRequest;
            _pendingReadFlag = flag;
        }
    }

    private void CancelReadInternal(string requestId)
    {
        lock (_configSync) if (_pendingReadRequest == requestId) ResetConfigReadLocked();
    }

    private void ParseConfigStream(ReadOnlySpan<byte> report, byte kind, int length)
    {
        lock (_configSync)
        {
            if (_pendingReadRequest is null || (_pendingReadFlag == 2) != (kind == 0x06)) return;
            var chunk = report[2]; var total = report[3];
            var declared = report[10] | (report[11] << 8); var crc = report[12] | (report[13] << 8);
            var source = kind == 0x06 ? report[14] : 0;
            var headerBytes = kind == 0x06 ? 10 : 9;
            var dataOffset = kind == 0x06 ? 15 : 14;
            if (length < headerBytes) { ResetConfigReadLocked(); return; }
            var count = length - headerBytes;
            var numericRequest = BitConverter.ToUInt32(report.Slice(6, 4));
            var maxChunk = kind == 0x06 ? 49 : 50;
            if (numericRequest == 0 || numericRequest != _pendingReadNumericRequest) return;
            if (!VendorReportProtocol.HasValidStreamBounds(kind, total, declared) || count > maxChunk || dataOffset + count > report.Length || (kind == 0x06 && source > 3) || report.Slice(dataOffset + count).ToArray().Any(value => value != 0)) { ResetConfigReadLocked(); return; }
            if (chunk == 0) { _configChunks.Clear(); _configTotal=total; _configLength=declared; _configCrc16=crc; _configSource=source; _configNextChunk=0; _configNumericRequest=numericRequest; _configLastChunk=null; }
            if (total!=_configTotal || declared!=_configLength || crc!=_configCrc16 || source!=_configSource || numericRequest!=_configNumericRequest) { ResetConfigReadLocked(); return; }
            var chunkBytes=report.Slice(dataOffset,count).ToArray();
            if (chunk == _configNextChunk - 1 && _configLastChunk is not null && _configLastChunk.AsSpan().SequenceEqual(chunkBytes)) return;
            if (chunk != _configNextChunk) { ResetConfigReadLocked(); return; }
            _configChunks.Add(chunkBytes); _configLastChunk=chunkBytes; _configNextChunk++;
            _writer.ConfigProgress(_pendingReadRequest, _configNextChunk, _configTotal);
            if (_configNextChunk != _configTotal) return;
            var data=_configChunks.SelectMany(value=>value).ToArray();
            if (data.Length!=_configLength || Crc16Ccitt(data)!=_configCrc16) { ResetConfigReadLocked(); return; }
            if (kind == 0x06) _writer.ConfigSnapshot(_pendingReadRequest,data.Length,_configCrc16,_configSource,Convert.ToBase64String(data));
            else
            {
                try
                {
                    using var json=JsonDocument.Parse(data);
                    if (json.RootElement.GetProperty("schema").GetString() != "ai_keyboard.config_status.v1") throw new JsonException("invalid-status-schema");
                    var capabilities=json.RootElement.GetProperty("capabilities");
                    var link=json.RootElement.GetProperty("link");
                    var agent=json.RootElement.GetProperty("agent_state");
                    _writer.ConfigCapabilities(_pendingReadRequest,
                        capabilities.TryGetProperty("config_read_v1",out var read)&&read.ValueKind==JsonValueKind.True,
                        capabilities.TryGetProperty("config_write_v1",out var write)&&write.ValueKind==JsonValueKind.True,
                        capabilities.TryGetProperty("host_action_v1",out var hostAction)&&hostAction.ValueKind==JsonValueKind.True,
                        capabilities.TryGetProperty("fixed_text_v1",out var fixedText)&&fixedText.ValueKind==JsonValueKind.True,
                        capabilities.TryGetProperty("deskmate_link_v1",out var deskMateLink)&&deskMateLink.ValueKind==JsonValueKind.True,
                        capabilities.TryGetProperty("agent_state_bridge_v1",out var agentStateBridge)&&agentStateBridge.ValueKind==JsonValueKind.True,
                        link.GetProperty("state").GetString() ?? "faulted",
                        ReadCounter(link, "rx_frames"),
                        ReadCounter(link, "tx_frames"),
                        ReadCounter(link, "request_timeouts"),
                        ReadCounter(link, "retries"),
                        ReadCounter(link, "peer_restarts"),
                        ReadCounter(agent, "accepted"),
                        ReadCounter(agent, "malformed"),
                        ReadCounter(agent, "dropped_disconnected"),
                        ReadCounter(agent, "forwarded"),
                        ReadCounter(agent, "queue_drops"));
                }
                catch (JsonException) { ResetConfigReadLocked(); return; }
            }
            ResetConfigReadLocked();
        }
    }

    private void ResetConfigRead()
    {
        lock (_configSync) ResetConfigReadLocked();
    }

    private void ResetConfigReadLocked()
    {
        _pendingReadRequest = null; _pendingReadNumericRequest = 0; _pendingReadFlag = 0;
        _configChunks.Clear(); _configLastChunk = null; _configTotal = _configLength = _configCrc16 = _configSource = _configNextChunk = 0; _configNumericRequest = 0;
    }

    private static int Crc16Ccitt(byte[] data)
    {
        var crc = 0xffff;
        foreach (var value in data) { crc ^= value << 8; for (var bit = 0; bit < 8; bit++) crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
        return crc;
    }

    private static uint ReadCounter(JsonElement parent, string name)
    {
        if (!parent.TryGetProperty(name, out var value) || !value.TryGetUInt32(out var result))
            throw new JsonException($"invalid-status-counter:{name}");
        return result;
    }

    private static bool IsCanonicalUuid(string value)
    {
        if (value.Length != 36) return false;
        for (var index = 0; index < value.Length; index++)
        {
            if (index is 8 or 13 or 18 or 23) { if (value[index] != '-') return false; }
            else if (!char.IsAsciiHexDigit(value[index]) || char.IsUpper(value[index])) return false;
        }
        return true;
    }

    private (bool ok, string reason, int bytes) InjectFixedTextInternal(string requestId, long expiresUnixMs, uint blockedProcessId, IReadOnlySet<IntPtr> blockedWindows)
    {
        PendingFixedText pending;
        lock (_fixedTextSync)
        {
            if (_pendingFixedText is null || _pendingFixedText.RequestId != requestId)
                return (false, "fixed-text-not-pending", 0);
            pending = _pendingFixedText;
            _pendingFixedText = null;
        }
        var now = DateTimeOffset.UtcNow;
        if (now > pending.Expires || now.ToUnixTimeMilliseconds() > expiresUnixMs)
            return (false, "fixed-text-command-expired", 0);
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero || !IsWindowVisible(foreground))
            return (false, "fixed-text-no-visible-target", 0);
        GetWindowThreadProcessId(foreground, out var foregroundProcessId);
        if (foregroundProcessId == 0 || foregroundProcessId == Environment.ProcessId || foregroundProcessId == blockedProcessId || blockedWindows.Contains(foreground))
            return (false, "fixed-text-target-rejected", 0);
        var inputs = new List<NativeInput>(pending.Text.Length * 2);
        foreach (var character in pending.Text)
        {
            inputs.Add(NativeInput.Unicode(character, false));
            inputs.Add(NativeInput.Unicode(character, true));
        }
        var sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<NativeInput>());
        return sent == inputs.Count ? (true, "", pending.Bytes) : (false, "fixed-text-send-input-incomplete", 0);
    }

    private (bool ok, string reason) PasteActiveWindowInternal(IntPtr expectedWindow)
    {
        var foreground = GetForegroundWindow();
        if (expectedWindow == IntPtr.Zero || foreground != expectedWindow || !IsWindowVisible(foreground))
            return (false, "target-window-changed");
        var inputs = new[]
        {
            NativeInput.Key(VkControl, false), NativeInput.Key(VkV, false),
            NativeInput.Key(VkV, true), NativeInput.Key(VkControl, true),
        };
        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<NativeInput>());
        if (sent == inputs.Length) return (true, "");
        var releases = new[] { NativeInput.Key(VkV, true), NativeInput.Key(VkControl, true) };
        SendInput((uint)releases.Length, releases, Marshal.SizeOf<NativeInput>());
        return (false, "desktop-output-send-input-incomplete");
    }

    private (bool ok, string reason, string targetWindow) CaptureActiveWindowInternal()
    {
        var foreground = GetForegroundWindow();
        if (foreground == IntPtr.Zero || !IsWindowVisible(foreground))
            return (false, "foreground-window-unavailable", string.Empty);
        return (true, "", unchecked((ulong)foreground.ToInt64()).ToString());
    }

    private void RefreshBoardStatus(bool force)
    {
        var connected = EnumerateDeviceNames().Any(name => name.Contains(BoardVidPid, StringComparison.OrdinalIgnoreCase));
        if (!force && connected == _boardConnected) return;
        _boardConnected = connected;
        if (!connected)
        {
            _boardControlDown = false;
            _boardShiftDown = false;
            _boardVoiceInputDown = false;
            _boardVoiceEditDown = false;
            ResetConfigRead();
            lock (_fixedTextSync)
            {
                _fixedTextAssembler.Reset();
                _pendingFixedText = null;
            }
        }
        _writer.Status(connected);
    }

    private IntPtr KeyboardHook(int code, IntPtr message, IntPtr data)
    {
        if (code >= 0)
        {
            var value = Marshal.PtrToStructure<LowLevelKeyboardInput>(data);
            var messageId = message.ToInt32();
            var isDown = messageId is WmKeyDown or WmSysKeyDown;
            var isUp = messageId is WmKeyUp or WmSysKeyUp;
            if (value.VirtualKey is VkControl or VkLControl or VkRControl)
                _hookControlDown = isDown || (!isUp && _hookControlDown);
            else if (value.VirtualKey is VkShift or VkLShift or VkRShift)
                _hookShiftDown = isDown || (!isUp && _hookShiftDown);
            else if (value.VirtualKey == VkE)
            {
                if (isDown && _hookControlDown && _hookShiftDown && !_hookVoiceEditDown)
                {
                    _hookVoiceEditDown = true;
                    _writer.Input("keyboard", "VoiceEdit", "down");
                }
                else if (isUp && _hookVoiceEditDown)
                {
                    _hookVoiceEditDown = false;
                    _writer.Input("keyboard", "VoiceEdit", "up");
                }
            }
            if (value.VirtualKey == VkF22)
            {
                if (messageId is WmKeyDown or WmSysKeyDown) _writer.Input("f22-fallback", "F22", "down");
                else if (messageId is WmKeyUp or WmSysKeyUp) _writer.Input("f22-fallback", "F22", "up");
            }
        }
        return CallNextHookEx(_keyboardHook, code, message, data);
    }

    private static IEnumerable<string> EnumerateDeviceNames()
    {
        uint count = 0;
        var itemSize = (uint)Marshal.SizeOf<RawInputDeviceList>();
        if (GetRawInputDeviceList(IntPtr.Zero, ref count, itemSize) != 0 || count == 0) yield break;
        var buffer = Marshal.AllocHGlobal(checked((int)(count * itemSize)));
        try
        {
            if (GetRawInputDeviceList(buffer, ref count, itemSize) == uint.MaxValue) yield break;
            for (var index = 0; index < count; index++)
            {
                var item = Marshal.PtrToStructure<RawInputDeviceList>(IntPtr.Add(buffer, checked((int)(index * itemSize))));
                if (item.Type == RimTypeKeyboard) yield return GetDeviceName(item.Device);
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static string GetDeviceName(IntPtr device)
    {
        uint length = 0;
        GetRawInputDeviceInfo(device, RidiDeviceName, null, ref length);
        if (length == 0) return string.Empty;
        var builder = new StringBuilder((int)length + 1);
        return GetRawInputDeviceInfo(device, RidiDeviceName, builder, ref length) == uint.MaxValue ? string.Empty : builder.ToString();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        if (ReferenceEquals(Current, this)) Current = null;
        if (_keyboardHook != IntPtr.Zero) UnhookWindowsHookEx(_keyboardHook);
        DestroyHandle();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputDevice { public ushort UsagePage; public ushort Usage; public uint Flags; public IntPtr Target; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputDeviceList { public IntPtr Device; public uint Type; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputHeader { public uint Type; public uint Size; public IntPtr Device; public IntPtr WParam; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawKeyboard
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawHidHeader { public uint SizeHid; public uint Count; }

    [StructLayout(LayoutKind.Sequential)]
    private struct LowLevelKeyboardInput
    {
        public uint VirtualKey;
        public uint ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    private sealed record PendingFixedText(string RequestId, string Text, int Bytes, DateTimeOffset Expires);

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeInput
    {
        public uint Type;
        public NativeInputUnion Value;

        public static NativeInput Unicode(char character, bool keyUp) => new()
        {
            Type = 1,
            Value = new NativeInputUnion
            {
                Keyboard = new NativeKeyboardInput { ScanCode = character, Flags = keyUp ? 0x0006u : 0x0004u }
            }
        };

        public static NativeInput Key(ushort virtualKey, bool keyUp) => new()
        {
            Type = 1,
            Value = new NativeInputUnion
            {
                Keyboard = new NativeKeyboardInput { VirtualKey = virtualKey, Flags = keyUp ? 0x0002u : 0u }
            }
        };
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct NativeInputUnion
    {
        [FieldOffset(0)] public NativeKeyboardInput Keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeKeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public UIntPtr ExtraInfo;
    }

    private delegate IntPtr LowLevelKeyboardProc(int code, IntPtr message, IntPtr data);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterRawInputDevices([In] RawInputDevice[] devices, uint count, uint size);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputData(IntPtr input, uint command, IntPtr data, ref uint size, uint headerSize);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputDeviceList(IntPtr list, ref uint count, uint size);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, StringBuilder? data, ref uint size);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int hook, LowLevelKeyboardProc callback, IntPtr module, uint threadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? moduleName);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint inputCount, [In] NativeInput[] inputs, int inputSize);
}
