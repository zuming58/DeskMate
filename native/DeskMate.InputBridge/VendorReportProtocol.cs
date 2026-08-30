using System.Text;

namespace DeskMate.InputBridge;

internal static class VendorReportProtocol
{
    private const byte ReportId = 0x11;
    private const byte FixedTextKind = 0x01;
    private const byte StatusStreamKind = 0x04;
    private const byte ConfigStreamKind = 0x06;

    public static bool HasValidEnvelope(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != ReportId) return false;
        var kind = report[1];
        var chunk = report[2];
        var total = report[3];
        var length = report[4];
        if (5 + length > report.Length) return false;
        if (report.Slice(5 + length).ContainsAnyExcept((byte)0)) return false;

        if (kind == FixedTextKind)
            return total is >= 1 and <= 17 && chunk < total && length is >= 1 and <= 59;

        if (kind is StatusStreamKind or ConfigStreamKind)
            return total != 0 && chunk < total;

        return chunk == 0 && total == 1;
    }

    public static bool RunSelfTest()
    {
        const string statusJson =
            "{\"schema\":\"ai_keyboard.config_status.v1\",\"capabilities\":{\"config_read_v1\":true,\"config_write_v1\":true}}";
        var statusReports = MakeStatusReports(0x78563412, statusJson);
        var configMiddle = MakeEnvelope(ConfigStreamKind, 3, 5, 59);
        var ackWithStreamShape = MakeEnvelope(0x03, 0, 2, 7);
        var outOfRangeChunk = MakeEnvelope(StatusStreamKind, 2, 2, 20);
        var hostActionWithPadding = MakeEnvelope(0x05, 0, 1, 36);
        hostActionWithPadding[41] = 1;
        var fixedText = new FixedTextAssembler(() => DateTimeOffset.UnixEpoch);
        var first = MakeEnvelope(FixedTextKind, 0, 2, 59);
        Enumerable.Repeat((byte)'a', 59).ToArray().CopyTo(first, 5);
        var last = MakeEnvelope(FixedTextKind, 1, 2, 3);
        Encoding.UTF8.GetBytes("好").CopyTo(last, 5);
        var duplicateFirst = new FixedTextAssembler(() => DateTimeOffset.UnixEpoch);
        var invalidPadding = MakeEnvelope(FixedTextKind, 0, 1, 1);
        invalidPadding[5] = (byte)'x';
        invalidPadding[6] = 1;
        var invalidUtf8 = MakeEnvelope(FixedTextKind, 0, 1, 2);
        invalidUtf8[5] = 0xc3;
        invalidUtf8[6] = 0x28;
        var agentState = MakeAgentStateReport(2, 0x10203040, 600000, 0x78563412);
        var invalidAgentPadding = agentState.ToArray();
        invalidAgentPadding[17] = 1;
        var invalidAgentTtl = MakeAgentStateReport(0, 1, 1, 0);

        return statusReports.Length == 3 &&
               statusReports.All(report => HasValidEnvelope(report)) &&
               statusReports[0][1] == StatusStreamKind &&
               statusReports[0][2] == 0 &&
               statusReports[0][3] == statusReports.Length &&
               statusReports[0][4] == 59 &&
               statusReports[^1][2] == statusReports.Length - 1 &&
               HasValidEnvelope(configMiddle) &&
               fixedText.Accept(first, out _) &&
               fixedText.Accept(last, out var completed) &&
               completed.Bytes == 62 &&
               completed.Text.EndsWith("好", StringComparison.Ordinal) &&
               !fixedText.Accept(last, out _) &&
               duplicateFirst.Accept(first, out _) &&
               !duplicateFirst.Accept(first, out _) &&
               !duplicateFirst.Accept(last, out _) &&
               !new FixedTextAssembler().Accept(invalidPadding, out _) &&
               !new FixedTextAssembler().Accept(invalidUtf8, out _) &&
               !HasValidEnvelope(hostActionWithPadding) &&
               !HasValidEnvelope(ackWithStreamShape) &&
               !HasValidEnvelope(outOfRangeChunk) &&
               IsValidAgentStateReport(agentState) &&
               !IsValidAgentStateReport(invalidAgentPadding) &&
               !IsValidAgentStateReport(invalidAgentTtl);
    }

    public static bool IsValidAgentStateReport(ReadOnlySpan<byte> report)
    {
        if (report.Length != 64 || report[0] != 0x12 || report[1] != 2 ||
            report[2] > 6 || report[3] != 0 || report[4] != 0 ||
            report.Slice(17).ContainsAnyExcept((byte)0)) return false;
        var transitionId = BitConverter.ToUInt32(report.Slice(5, 4));
        var ttlMs = BitConverter.ToUInt32(report.Slice(9, 4));
        if (transitionId == 0) return false;
        return report[2] == 0 ? ttlMs == 0 : ttlMs is >= 1 and <= 600000;
    }

    private static byte[][] MakeStatusReports(uint requestId, string json)
    {
        var data = System.Text.Encoding.UTF8.GetBytes(json);
        const int bytesPerChunk = 50;
        var total = (data.Length + bytesPerChunk - 1) / bytesPerChunk;
        var crc = Crc16Ccitt(data);
        var reports = new byte[total][];
        for (var chunk = 0; chunk < total; chunk++)
        {
            var offset = chunk * bytesPerChunk;
            var count = Math.Min(bytesPerChunk, data.Length - offset);
            var report = MakeEnvelope(StatusStreamKind, (byte)chunk, (byte)total, (byte)(9 + count));
            report[5] = 1;
            BitConverter.TryWriteBytes(report.AsSpan(6, 4), requestId);
            BitConverter.TryWriteBytes(report.AsSpan(10, 2), (ushort)data.Length);
            BitConverter.TryWriteBytes(report.AsSpan(12, 2), crc);
            data.AsSpan(offset, count).CopyTo(report.AsSpan(14));
            reports[chunk] = report;
        }
        return reports;
    }

    private static ushort Crc16Ccitt(ReadOnlySpan<byte> data)
    {
        var crc = 0xffff;
        foreach (var value in data)
        {
            crc ^= value << 8;
            for (var bit = 0; bit < 8; bit++)
                crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
        return (ushort)crc;
    }

    private static byte[] MakeEnvelope(byte kind, byte chunk, byte total, byte length)
    {
        var report = new byte[64];
        report[0] = ReportId;
        report[1] = kind;
        report[2] = chunk;
        report[3] = total;
        report[4] = length;
        return report;
    }

    private static byte[] MakeAgentStateReport(byte state, uint transitionId, uint ttlMs, uint sourceHash)
    {
        var report = new byte[64];
        report[0] = 0x12;
        report[1] = 2;
        report[2] = state;
        BitConverter.TryWriteBytes(report.AsSpan(5, 4), transitionId);
        BitConverter.TryWriteBytes(report.AsSpan(9, 4), ttlMs);
        BitConverter.TryWriteBytes(report.AsSpan(13, 4), sourceHash);
        return report;
    }
}

internal sealed record FixedTextPayload(string Text, int Bytes);

internal sealed class FixedTextAssembler
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private readonly Func<DateTimeOffset> _now;
    private readonly List<byte> _bytes = new(960);
    private byte _total;
    private byte _next;
    private DateTimeOffset _lastProgress;
    private byte[]? _completedReport;
    private DateTimeOffset _completedAt;

    public FixedTextAssembler(Func<DateTimeOffset>? now = null) => _now = now ?? (() => DateTimeOffset.UtcNow);

    public bool Accept(ReadOnlySpan<byte> report, out FixedTextPayload payload)
    {
        payload = new FixedTextPayload(string.Empty, 0);
        var now = _now();
        if (report.Length != 64 || report[0] != 0x11 || report[1] != 0x01 || !VendorReportProtocol.HasValidEnvelope(report))
        {
            ResetActive();
            return false;
        }
        if (_next != 0 && now - _lastProgress > TimeSpan.FromSeconds(3)) ResetActive();
        var chunk = report[2];
        var total = report[3];
        var length = report[4];
        if (report.Slice(5 + length).ContainsAnyExcept((byte)0))
        {
            ResetActive();
            return false;
        }
        if (_completedReport is not null && now - _completedAt <= TimeSpan.FromMilliseconds(250) && report.SequenceEqual(_completedReport))
        {
            return false;
        }
        if (chunk == 0)
        {
            if (_next != 0)
            {
                ResetActive();
                return false;
            }
            ResetActive();
            _total = total;
        }
        if ((_next == 0 && chunk != 0) || total != _total || chunk != _next ||
            (chunk + 1 < total && length != 59) || _bytes.Count + length > 960)
        {
            ResetActive();
            return false;
        }
        _bytes.AddRange(report.Slice(5, length).ToArray());
        _next++;
        _lastProgress = now;
        if (_next != _total) return true;
        try
        {
            var data = _bytes.ToArray();
            var text = StrictUtf8.GetString(data);
            if (text.Length == 0 || text.Any(character => character == '\0' ||
                (character < ' ' && character is not '\t' and not '\r' and not '\n')))
                throw new DecoderFallbackException();
            payload = new FixedTextPayload(text, data.Length);
            _completedReport = report.ToArray();
            _completedAt = now;
            ResetActive();
            return true;
        }
        catch (DecoderFallbackException)
        {
            ResetActive();
            return false;
        }
    }

    public void Reset()
    {
        ResetActive();
        _completedReport = null;
    }

    private void ResetActive()
    {
        _bytes.Clear();
        _total = 0;
        _next = 0;
        _lastProgress = default;
    }
}
