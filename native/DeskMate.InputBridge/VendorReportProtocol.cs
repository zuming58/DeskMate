namespace DeskMate.InputBridge;

internal static class VendorReportProtocol
{
    private const byte ReportId = 0x11;
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

        return statusReports.Length == 3 &&
               statusReports.All(report => HasValidEnvelope(report)) &&
               statusReports[0][1] == StatusStreamKind &&
               statusReports[0][2] == 0 &&
               statusReports[0][3] == statusReports.Length &&
               statusReports[0][4] == 59 &&
               statusReports[^1][2] == statusReports.Length - 1 &&
               HasValidEnvelope(configMiddle) &&
               !HasValidEnvelope(ackWithStreamShape) &&
               !HasValidEnvelope(outOfRangeChunk);
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
}
